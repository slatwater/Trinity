defmodule Trinity.ClaudeSession do
  @moduledoc """
  GenServer managing a persistent Claude CLI session per project.
  Wraps ClaudeAgentSDK.Streaming for multi-turn conversation.
  """
  use GenServer, restart: :temporary
  require Logger

  defstruct [
    :project_id,
    :project_path,
    :sdk_session,
    :status,
    :session_id,
    :task_ref,
    :current_prompt,
    current_response: "",
    queue: [],
    messages: []
  ]

  # Public API

  def start_link({project_id, project_path, opts}) do
    name = via(project_id)
    GenServer.start_link(__MODULE__, {project_id, project_path, opts}, name: name)
  end

  def send_message(project_id, prompt) do
    GenServer.call(via(project_id), {:send_message, prompt}, :infinity)
  end

  def alive?(project_id) do
    case Registry.lookup(Trinity.SessionRegistry, project_id) do
      [{_pid, _}] -> true
      [] -> false
    end
  end

  def get_messages(project_id) do
    case Registry.lookup(Trinity.SessionRegistry, project_id) do
      [{_pid, _}] -> GenServer.call(via(project_id), :get_messages)
      [] -> {[], :idle}
    end
  end

  def stop(project_id) do
    case Registry.lookup(Trinity.SessionRegistry, project_id) do
      [{pid, _}] -> DynamicSupervisor.terminate_child(Trinity.SessionManager, pid)
      [] -> :ok
    end
  end

  defp via(project_id) do
    {:via, Registry, {Trinity.SessionRegistry, project_id}}
  end

  # GenServer callbacks

  @impl true
  def init({project_id, project_path, _opts}) do
    Logger.info("[ClaudeSession] Starting session for #{project_id} at #{project_path}")

    case ClaudeAgentSDK.Streaming.start_session(%ClaudeAgentSDK.Options{
           system_prompt: %{type: :preset, preset: :claude_code},
           permission_mode: :bypass_permissions,
           cwd: project_path,
           include_partial_messages: true,
         }) do
      {:ok, sdk_session} ->
        state = %__MODULE__{
          project_id: project_id,
          project_path: project_path,
          sdk_session: sdk_session,
          status: :idle
        }

        {:ok, state}

      {:error, reason} ->
        Logger.error("[ClaudeSession] Failed to start SDK session: #{inspect(reason)}")
        {:stop, reason}
    end
  end

  @impl true
  def handle_call({:send_message, prompt}, from, %{status: :idle} = state) do
    state = dispatch_message(prompt, from, state)
    {:noreply, state}
  end

  def handle_call({:send_message, prompt}, from, %{status: :busy} = state) do
    {:noreply, %{state | queue: state.queue ++ [{prompt, from}]}}
  end

  def handle_call(:get_messages, _from, state) do
    # Return completed messages + in-progress response if any
    all_msgs =
      if state.status == :busy and state.current_prompt do
        state.messages ++
          [
            %{role: "user", content: state.current_prompt},
            %{role: "assistant", content: state.current_response}
          ]
      else
        state.messages
      end

    {:reply, {all_msgs, state.status}, state}
  end

  @impl true
  def handle_info({:accumulate_text, text}, state) do
    {:noreply, %{state | current_response: state.current_response <> text}}
  end

  def handle_info({ref, :stream_done}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])

    messages =
      state.messages ++
        [
          %{role: "user", content: state.current_prompt},
          %{role: "assistant", content: state.current_response}
        ]

    state = %{state | status: :idle, task_ref: nil, messages: messages, current_prompt: nil, current_response: ""}
    state = drain_queue(state)
    {:noreply, state}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    Logger.warning("[ClaudeSession] Stream task crashed: #{inspect(reason)}")
    # Save whatever we accumulated
    messages =
      if state.current_prompt do
        state.messages ++
          [
            %{role: "user", content: state.current_prompt},
            %{role: "assistant", content: state.current_response <> "\n[Error: task crashed]"}
          ]
      else
        state.messages
      end

    state = %{state | status: :idle, task_ref: nil, messages: messages, current_prompt: nil, current_response: ""}
    state = drain_queue(state)
    {:noreply, state}
  end

  def handle_info(_msg, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, %{sdk_session: sdk_session}) when not is_nil(sdk_session) do
    Logger.info("[ClaudeSession] Closing SDK session")
    ClaudeAgentSDK.Streaming.close_session(sdk_session)
    :ok
  end

  def terminate(_reason, _state), do: :ok

  # Internals

  defp dispatch_message(prompt, from, state) do
    topic = "session:#{state.project_id}"
    sdk_session = state.sdk_session
    genserver_pid = self()

    task =
      Task.async(fn ->
        try do
          sdk_session
          |> ClaudeAgentSDK.Streaming.send_message(prompt)
          |> Stream.each(fn event ->
            sse_event = Trinity.StreamEventParser.to_sse(event)

            if sse_event do
              Phoenix.PubSub.broadcast(Trinity.PubSub, topic, {:stream_event, sse_event})

              case sse_event do
                %{type: "text", content: text} ->
                  send(genserver_pid, {:accumulate_text, text})
                _ -> :ok
              end
            end
          end)
          |> Stream.run()
        rescue
          e ->
            Logger.error("[ClaudeSession] Stream error: #{inspect(e)}")
            Phoenix.PubSub.broadcast(Trinity.PubSub, topic, {:stream_event, %{type: "error", content: inspect(e)}})
        end

        # Get session_id if available
        session_id =
          case ClaudeAgentSDK.Streaming.get_session_id(sdk_session) do
            {:ok, id} -> id
            _ -> nil
          end

        Phoenix.PubSub.broadcast(Trinity.PubSub, topic, {:stream_event, %{type: "done", sessionId: session_id}})

        :stream_done
      end)

    GenServer.reply(from, {:ok, topic})

    %{state | status: :busy, task_ref: task.ref, current_prompt: prompt, current_response: ""}
  end

  defp drain_queue(%{queue: []} = state), do: state

  defp drain_queue(%{queue: [{prompt, from} | rest]} = state) do
    state = %{state | queue: rest}
    dispatch_message(prompt, from, state)
  end
end
