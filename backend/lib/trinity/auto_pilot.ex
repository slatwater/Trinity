defmodule Trinity.AutoPilot do
  @moduledoc """
  Orchestrator GenServer for the Auto Pilot feature.
  Manages two Claude agents (A: requirements/spec/code, B: tests)
  through a state machine: clarifying → generating_spec → writing_tests → waiting_merge → writing_code → waiting_ci → (fixing →)* merging → done
  """
  use GenServer, restart: :temporary
  require Logger

  defstruct [
    :id,
    :project_id,
    :project_path,
    :requirement,
    :branch_name,
    :spec,
    :test_pr_url,
    :feat_pr_url,
    :merge_poll_ref,
    phase: :clarifying,
    agent_a_id: nil,
    agent_b_id: nil,
    error: nil
  ]

  # --- Public API ---

  def start_link({id, project_id, project_path, requirement}) do
    GenServer.start_link(__MODULE__, {id, project_id, project_path, requirement},
      name: via(id)
    )
  end

  def get_status(id), do: GenServer.call(via(id), :get_status)
  def get_agent_ids(id), do: GenServer.call(via(id), :get_agent_ids)
  def confirm(id), do: GenServer.cast(via(id), :confirm)

  def cancel(id) do
    case Registry.lookup(Trinity.AutoPilotRegistry, id) do
      [{pid, _}] -> DynamicSupervisor.terminate_child(Trinity.AutoPilotManager, pid)
      [] -> :ok
    end
  end

  def alive?(id) do
    case Registry.lookup(Trinity.AutoPilotRegistry, id) do
      [{_pid, _}] -> true
      [] -> false
    end
  end

  defp via(id), do: {:via, Registry, {Trinity.AutoPilotRegistry, id}}

  # --- GenServer Callbacks ---

  @impl true
  def init({id, project_id, project_path, requirement}) do
    branch_name =
      requirement
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9]+/, "-")
      |> String.trim("-")
      |> String.slice(0, 30)

    agent_a_id = "ap:#{id}:a"
    agent_b_id = "ap:#{id}:b"

    case start_session(agent_a_id, project_path) do
      {:ok, _pid} ->
        initial_prompt = """
        你是需求分析 Agent。你当前处于【澄清阶段】。

        严格规则：
        - 只能提问和讨论，禁止写代码、禁止使用任何工具（Read/Edit/Write/Bash/Grep 等全部禁止）
        - 不要生成规格文档，不要开始实现
        - 用户会在另一个步骤明确告诉你"开始"，在此之前你只负责提问澄清

        用户需求：#{requirement}

        请用中文提出最多 3 个澄清问题。如果需求已经足够清楚，回复"需求已清楚，等待确认"。
        """

        async_send(agent_a_id, initial_prompt)

        state = %__MODULE__{
          id: id,
          project_id: project_id,
          project_path: project_path,
          requirement: requirement,
          branch_name: branch_name,
          agent_a_id: agent_a_id,
          agent_b_id: agent_b_id
        }

        broadcast_phase(id, "clarifying")
        Logger.info("[AutoPilot] Started #{id} for #{project_id}")
        {:ok, state}

      {:error, reason} ->
        Logger.error("[AutoPilot] Failed to start Agent A: #{inspect(reason)}")
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:get_status, _from, state) do
    {a_msgs, a_status} = Trinity.ClaudeSession.get_messages(state.agent_a_id)
    {b_msgs, b_status} = Trinity.ClaudeSession.get_messages(state.agent_b_id)

    a_workflow = Trinity.ClaudeSession.get_workflow(state.agent_a_id)
    b_workflow = Trinity.ClaudeSession.get_workflow(state.agent_b_id)

    status = %{
      id: state.id,
      project_id: state.project_id,
      phase: to_string(state.phase),
      requirement: state.requirement,
      branch_name: state.branch_name,
      spec: state.spec,
      test_pr_url: state.test_pr_url,
      feat_pr_url: state.feat_pr_url,
      error: state.error,
      agent_a: %{
        id: state.agent_a_id,
        status: to_string(a_status),
        messages: a_msgs,
        workflow: format_workflow(a_workflow)
      },
      agent_b: %{
        id: state.agent_b_id,
        status: to_string(b_status),
        messages: b_msgs,
        workflow: format_workflow(b_workflow)
      }
    }

    {:reply, status, state}
  end

  def handle_call(:get_agent_ids, _from, state) do
    {:reply, {state.agent_a_id, state.agent_b_id, state.project_path}, state}
  end

  @impl true
  def handle_cast(:confirm, %{phase: :clarifying} = state) do
    state = %{state | phase: :generating_spec}
    broadcast_phase(state.id, "generating_spec")

    spec_prompt =
      "基于以上讨论，输出简洁的功能规格文档。用 Markdown 格式，包含：功能描述、接口设计、边界条件。"

    async_send_and_notify(state.agent_a_id, spec_prompt, :spec_generated)
    {:noreply, state}
  end

  def handle_cast(:confirm, state), do: {:noreply, state}

  @impl true
  def handle_info(:spec_generated, %{phase: :generating_spec} = state) do
    {messages, _} = Trinity.ClaudeSession.get_messages(state.agent_a_id)
    spec = last_assistant_content(messages)

    Logger.info("[AutoPilot] Spec generated for #{state.id}")
    state = %{state | spec: spec, phase: :writing_tests}
    broadcast_phase(state.id, "writing_tests")

    case start_session(state.agent_b_id, state.project_path) do
      {:ok, _pid} ->
        test_prompt = """
        你是测试 Agent。根据以下功能规格更新测试：

        #{spec}

        严格规则：
        - 禁止新建测试文件，只能修改项目中已有的测试文件
        - 先查看项目现有的测试目录结构和测试文件，了解测试框架和风格
        - 在最合适的已有测试文件中添加或修改测试用例
        - 如果项目还没有测试文件，只允许创建一个测试文件
        - 所有新增测试标记为 skip/pending

        执行步骤：
        1. 创建 test/#{state.branch_name} 分支
        2. 查看现有测试文件，在其中添加/修改测试用例
        3. git push 并用 gh pr create 创建 PR 到 main
        4. 用 gh pr merge --auto --squash 设置自动合入
        5. 完成后输出 PR 链接
        """

        async_send_and_notify(state.agent_b_id, test_prompt, :tests_written)
        {:noreply, state}

      {:error, reason} ->
        Logger.error("[AutoPilot] Failed to start Agent B: #{inspect(reason)}")
        {:noreply, %{state | phase: :error, error: "Failed to start test agent: #{inspect(reason)}"}}
    end
  end

  def handle_info(:tests_written, %{phase: :writing_tests} = state) do
    {messages, _} = Trinity.ClaudeSession.get_messages(state.agent_b_id)
    test_pr_url = extract_pr_url(messages)

    Logger.info("[AutoPilot] Tests written for #{state.id}, PR: #{test_pr_url || "not found"}")
    state = %{state | test_pr_url: test_pr_url, phase: :waiting_merge}
    broadcast_phase(state.id, "waiting_merge")

    ref = Process.send_after(self(), :check_merge, 10_000)
    {:noreply, %{state | merge_poll_ref: ref}}
  end

  def handle_info(:check_merge, %{phase: :waiting_merge} = state) do
    case check_pr_merged(state.project_path, state.test_pr_url) do
      true ->
        Logger.info("[AutoPilot] Test PR merged for #{state.id}")
        state = %{state | phase: :writing_code, merge_poll_ref: nil}
        broadcast_phase(state.id, "writing_code")

        code_prompt = """
        测试已合入 main。请执行：
        1. git pull origin main
        2. 创建 feat/#{state.branch_name} 分支
        3. 实现功能，确保符合之前生成的规格
        4. 移除测试中的 skip/pending 标记
        5. 运行测试确保全部通过
        6. git push 并用 gh pr create 创建 PR 到 main
        7. 完成后输出 PR 链接
        """

        async_send_and_notify(state.agent_a_id, code_prompt, :code_written)
        {:noreply, state}

      false ->
        ref = Process.send_after(self(), :check_merge, 15_000)
        {:noreply, %{state | merge_poll_ref: ref}}
    end
  end

  def handle_info(:code_written, %{phase: :writing_code} = state) do
    {messages, _} = Trinity.ClaudeSession.get_messages(state.agent_a_id)
    feat_pr_url = extract_pr_url(messages)

    Logger.info("[AutoPilot] Code written for #{state.id}, PR: #{feat_pr_url || "not found"}")
    state = %{state | feat_pr_url: feat_pr_url, phase: :waiting_ci}
    broadcast_phase(state.id, "waiting_ci")

    # Wait a bit for CI to start, then begin polling
    ref = Process.send_after(self(), :check_ci, 30_000)
    {:noreply, %{state | merge_poll_ref: ref}}
  end

  def handle_info(:check_ci, %{phase: :waiting_ci} = state) do
    case check_pr_ci(state.project_path, state.feat_pr_url) do
      :success ->
        Logger.info("[AutoPilot] CI passed for #{state.id}, merging and tagging")
        state = %{state | phase: :merging, merge_poll_ref: nil}
        broadcast_phase(state.id, "merging")

        merge_prompt = """
        CI 全部通过。请执行：
        1. 用 gh pr merge #{state.feat_pr_url} --squash --auto 合并 PR
        2. 等待合并完成后 git checkout main && git pull origin main
        3. 读取当前最新的 git tag（如 v1.0.0），按语义化版本递增 patch 版本号
        4. 如果没有已有 tag，从 v0.1.0 开始
        5. 用 git tag <新版本号> 打标签
        6. 用 git push origin <新版本号> 推送标签
        7. 完成后输出新的版本号
        """

        async_send_and_notify(state.agent_a_id, merge_prompt, :release_done)
        {:noreply, state}

      :failure ->
        Logger.warning("[AutoPilot] CI failed for #{state.id}, fetching failure logs")
        state = %{state | phase: :fixing, merge_poll_ref: nil}
        broadcast_phase(state.id, "fixing")

        failure_log = get_ci_failure_log(state.project_path, state.feat_pr_url)

        fix_prompt = """
        CI 测试失败了。以下是失败日志：

        ```
        #{failure_log}
        ```

        请执行：
        1. 根据上面的失败日志分析问题原因
        2. 修复代码问题
        3. 运行本地测试确认通过
        4. git push（同一分支，CI 会重新运行）
        5. 完成后回复"已修复并推送"
        """

        async_send_and_notify(state.agent_a_id, fix_prompt, :fix_pushed)
        {:noreply, state}

      :pending ->
        ref = Process.send_after(self(), :check_ci, 15_000)
        {:noreply, %{state | merge_poll_ref: ref}}
    end
  end

  def handle_info(:release_done, %{phase: :merging} = state) do
    Logger.info("[AutoPilot] Release done for #{state.id}")
    state = %{state | phase: :done, merge_poll_ref: nil}
    broadcast_phase(state.id, "done")
    {:noreply, state}
  end

  def handle_info(:fix_pushed, %{phase: :fixing} = state) do
    Logger.info("[AutoPilot] Fix pushed for #{state.id}, re-checking CI")
    state = %{state | phase: :waiting_ci}
    broadcast_phase(state.id, "waiting_ci")

    ref = Process.send_after(self(), :check_ci, 30_000)
    {:noreply, %{state | merge_poll_ref: ref}}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, state) do
    if state.merge_poll_ref, do: Process.cancel_timer(state.merge_poll_ref)
    Trinity.ClaudeSession.stop(state.agent_a_id)
    Trinity.ClaudeSession.stop(state.agent_b_id)
    :ok
  end

  # --- Private Helpers ---

  defp start_session(session_id, project_path) do
    DynamicSupervisor.start_child(
      Trinity.SessionManager,
      {Trinity.ClaudeSession, {session_id, project_path, []}}
    )
  end

  defp async_send(session_id, prompt) do
    Task.start(fn ->
      Trinity.ClaudeSession.send_message(session_id, prompt)
    end)
  end

  defp async_send_and_notify(session_id, prompt, done_msg) do
    pid = self()

    Task.start(fn ->
      {:ok, _topic} = Trinity.ClaudeSession.send_message(session_id, prompt)
      wait_for_idle(session_id)
      send(pid, done_msg)
    end)
  end

  defp wait_for_idle(session_id) do
    Process.sleep(1000)

    case Trinity.ClaudeSession.get_messages(session_id) do
      {_msgs, :idle} -> :ok
      _ -> wait_for_idle(session_id)
    end
  end

  defp broadcast_phase(id, phase) do
    Phoenix.PubSub.broadcast(
      Trinity.PubSub,
      "autopilot:#{id}",
      {:autopilot_event, %{type: "phase", phase: phase}}
    )
  end

  defp format_workflow(nil), do: nil

  defp format_workflow(workflow) do
    %{
      project_id: workflow.project_id,
      status: workflow.status,
      stages: workflow.stages
    }
  end

  defp last_assistant_content(messages) do
    messages
    |> Enum.reverse()
    |> Enum.find_value(fn
      %{role: "assistant", content: c} -> c
      _ -> nil
    end) || ""
  end

  defp extract_pr_url(messages) do
    messages
    |> Enum.reverse()
    |> Enum.find_value(fn %{content: content} ->
      case Regex.run(~r{https://github\.com/[^\s)>\]]+/pull/\d+}, content || "") do
        [url] -> url
        _ -> nil
      end
    end)
  end

  defp check_pr_ci(_project_path, nil) do
    Logger.warning("[AutoPilot] No feat PR URL, cannot check CI")
    :pending
  end

  defp check_pr_ci(project_path, pr_url) do
    case System.cmd(
           "gh",
           ["pr", "checks", pr_url, "--json", "state,name"],
           cd: project_path,
           stderr_to_stdout: true
         ) do
      {output, 0} ->
        case Jason.decode(output) do
          {:ok, checks} when is_list(checks) and checks != [] ->
            states = Enum.map(checks, fn c -> String.upcase(c["state"] || "") end)

            cond do
              Enum.all?(states, &(&1 == "SUCCESS")) -> :success
              Enum.any?(states, &(&1 in ["FAILURE", "CANCELLED", "ERROR"])) -> :failure
              true -> :pending
            end

          _ ->
            :pending
        end

      _ ->
        :pending
    end
  end

  defp get_ci_failure_log(_project_path, nil) do
    Logger.warning("[AutoPilot] No feat PR URL, cannot get failure log")
    "Unable to fetch failure log: no PR URL"
  end

  defp get_ci_failure_log(project_path, pr_url) do
    # Get the latest failed run link
    case System.cmd(
           "gh",
           ["pr", "checks", pr_url, "--json", "name,state,link",
            "-q", ".[] | select(.state == \"FAILURE\" or .state == \"ERROR\") | .link"],
           cd: project_path,
           stderr_to_stdout: true
         ) do
      {output, 0} ->
        run_url = output |> String.trim() |> String.split("\n") |> List.first()
        run_id = if run_url, do: run_url |> String.split("/") |> List.last()

        if run_id && run_id != "" do
          case System.cmd("gh", ["run", "view", run_id, "--log-failed"],
                 cd: project_path, stderr_to_stdout: true) do
            {log, 0} -> String.slice(log, -3000, 3000) || log
            {err, _} -> "Failed to fetch log: #{String.slice(err, 0, 500)}"
          end
        else
          "No failed run details found"
        end

      {err, _} ->
        "Failed to query checks: #{String.slice(err, 0, 500)}"
    end
  end

  defp check_pr_merged(_project_path, nil) do
    Logger.warning("[AutoPilot] No test PR URL, cannot check merge status")
    false
  end

  defp check_pr_merged(project_path, pr_url) do
    case System.cmd("gh", ["pr", "view", pr_url, "--json", "state", "-q", ".state"],
           cd: project_path,
           stderr_to_stdout: true
         ) do
      {output, 0} -> String.trim(output) == "MERGED"
      _ -> false
    end
  end
end
