defmodule Trinity.EvolveLab do
  @moduledoc "Autonomous prompt evolution experiment engine."
  use GenServer
  require Logger

  @default_config %{
    "system_prompt" => "You are a helpful math tutor. Solve the problem step by step.",
    "few_shot_examples" => [],
    "format_instruction" => "Show your work, then give the final answer as: #### <number>"
  }

  @temperature 0
  @max_tokens 1024

  defstruct [:id, :strategy, :target, :num_experiments, :max_concurrent, :problems, :task_ref]

  # ── Client API ─────────────────────────────────────────

  def start_link(args), do: GenServer.start_link(__MODULE__, args, name: via(args.id))

  def cancel(id) do
    GenServer.stop(via(id), :normal)
  catch
    :exit, _ -> :ok
  end

  defp via(id), do: {:via, Registry, {Trinity.EvolveLabRegistry, id}}

  # ── Callbacks ──────────────────────────────────────────

  @impl true
  def init(args) do
    problems = load_problems()

    state = %__MODULE__{
      id: args.id,
      strategy: args.strategy,
      target: args.target,
      num_experiments: args.num_experiments,
      max_concurrent: args[:max_concurrent] || 20,
      problems: problems
    }

    task = Task.async(fn -> experiment_loop(state) end)
    {:ok, %{state | task_ref: task.ref}}
  end

  @impl true
  def handle_info({ref, :done}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    {:stop, :normal, state}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    unless reason == :normal do
      broadcast(state.id, %{type: "error", message: "#{inspect(reason)}"})
    end

    {:stop, :normal, state}
  end

  @impl true
  def handle_info(_, state), do: {:noreply, state}

  # ── Experiment loop (runs in linked Task) ──────────────

  defp experiment_loop(state) do
    broadcast(state.id, %{type: "phase", phase: "baseline", exp: 0})
    {baseline, elapsed} = timed(fn -> evaluate(state, 0, @default_config) end)
    baseline_row = make_row(0, baseline, elapsed, "keep", "baseline")
    broadcast(state.id, %{type: "result", result: baseline_row})

    {best_acc, best_cfg, rows} =
      Enum.reduce(1..state.num_experiments, {baseline.accuracy, @default_config, [baseline_row]}, fn i, acc ->
        experiment_step(state, i, acc)
      end)

    broadcast(state.id, %{type: "done", best_accuracy: best_acc, best_config: best_cfg, results: rows})
    :done
  end

  defp experiment_step(state, i, {best_acc, best_cfg, rows}) do
    broadcast(state.id, %{type: "phase", phase: "suggesting", exp: i})

    case suggest(state.strategy, best_cfg, rows) do
      {:ok, suggestion} ->
        desc = suggestion["description"] || "unknown"
        new_cfg = extract_config(suggestion)
        broadcast(state.id, %{type: "suggestion", exp: i, description: desc, config: new_cfg})

        broadcast(state.id, %{type: "phase", phase: "evaluating", exp: i})
        {result, elapsed} = timed(fn -> evaluate(state, i, new_cfg) end)

        improved = result.accuracy > best_acc
        status = if improved, do: "keep", else: "discard"
        row = make_row(i, result, elapsed, status, desc)
        broadcast(state.id, %{type: "result", result: row})

        if improved,
          do: {result.accuracy, new_cfg, rows ++ [row]},
          else: {best_acc, best_cfg, rows ++ [row]}

      {:error, reason} ->
        row = make_row(i, %{accuracy: 0, correct: 0, total: 0, cost: 0}, 0, "crash", "Error: #{reason}")
        broadcast(state.id, %{type: "result", result: row})
        {best_acc, best_cfg, rows ++ [row]}
    end
  end

  # ── Concurrent evaluation ──────────────────────────────

  defp evaluate(state, exp_num, config) do
    total = length(state.problems)
    counter = :counters.new(2, [:atomics])

    agg =
      state.problems
      |> Task.async_stream(
        fn problem ->
          r = eval_one(state.target, config, problem)
          :counters.add(counter, 1, 1)
          if r.correct, do: :counters.add(counter, 2, 1)
          completed = :counters.get(counter, 1)
          correct = :counters.get(counter, 2)

          if rem(completed, 5) == 0 or completed == total do
            broadcast(state.id, %{
              type: "progress",
              exp: exp_num,
              completed: completed,
              total: total,
              correct: correct
            })
          end

          r
        end,
        max_concurrency: state.max_concurrent,
        timeout: 60_000,
        ordered: false
      )
      |> Enum.reduce(%{correct: 0, total: 0, input_tokens: 0, output_tokens: 0}, fn
        {:ok, r}, acc ->
          %{
            acc
            | correct: acc.correct + if(r.correct, do: 1, else: 0),
              total: acc.total + 1,
              input_tokens: acc.input_tokens + r.input_tokens,
              output_tokens: acc.output_tokens + r.output_tokens
          }

        _, acc ->
          %{acc | total: acc.total + 1}
      end)

    accuracy = if agg.total > 0, do: agg.correct / agg.total, else: 0.0
    cost = estimate_cost(state.target.provider, agg.input_tokens, agg.output_tokens)
    %{accuracy: accuracy, correct: agg.correct, total: agg.total, cost: cost}
  end

  defp eval_one(target, config, problem) do
    messages = build_messages(config, problem["question"])

    case call_llm(target, messages, max_tokens: @max_tokens, temperature: @temperature) do
      {:ok, %{content: reply, input_tokens: inp, output_tokens: out}} ->
        predicted = extract_number(reply)
        correct = check_answer(predicted, problem["answer"])
        %{correct: correct, input_tokens: inp, output_tokens: out}

      {:error, _} ->
        %{correct: false, input_tokens: 0, output_tokens: 0}
    end
  rescue
    e ->
      Logger.warning("eval_one error: #{Exception.message(e)}")
      %{correct: false, input_tokens: 0, output_tokens: 0}
  end

  # ── Strategy model ─────────────────────────────────────

  defp suggest(strategy, current_config, results) do
    history =
      results
      |> Enum.map(fn r ->
        acc_pct = Float.round(r.accuracy * 100, 1)
        "- Exp #{r.exp}: accuracy=#{acc_pct}% (#{r.status}) — #{r.description}"
      end)
      |> Enum.join("\n")

    messages = [
      %{"role" => "system", "content" => strategy_system_prompt()},
      %{"role" => "user", "content" => strategy_user_prompt(current_config, history)}
    ]

    opts = [max_tokens: 2048, temperature: 0.7, timeout: 120_000]

    opts =
      if strategy.provider != "anthropic",
        do: Keyword.put(opts, :response_format, %{"type" => "json_object"}),
        else: opts

    case call_llm(strategy, messages, opts) do
      {:ok, %{content: content}} ->
        parse_json(content)

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp strategy_system_prompt do
    """
    You are a prompt engineering expert optimizing a math-solving prompt for GSM8K.

    Respond with a JSON object (no markdown, no code fences, pure JSON only):
    {
      "system_prompt": "...",
      "few_shot_examples": [["question", "ideal_response"], ...],
      "format_instruction": "...",
      "description": "one-line summary of the change"
    }

    Rules:
    - few_shot_examples: 0-5 items, each is [question_string, response_string].
    - The response in few-shot should demonstrate clear step-by-step reasoning ending with #### <number>.
    - Try ONE meaningful change per experiment to isolate what helps.
    - Be creative: different CoT styles, roles, verification steps, output formats.
    - If several attempts failed, try something radically different.
    """
  end

  defp strategy_user_prompt(config, history) do
    hist = if history == "", do: "(none — suggest the first modification after baseline)", else: history

    """
    Current best config:
    #{Jason.encode!(config, pretty: true)}

    Experiment history:
    #{hist}

    Suggest a modification to improve accuracy.
    """
  end

  # ── LLM API (SDK / OpenAI / Anthropic) ──────────────────

  defp call_llm(%{provider: "sdk"} = config, messages, opts), do: call_sdk(config, messages, opts)
  defp call_llm(%{provider: "anthropic"} = config, messages, opts), do: call_anthropic(config, messages, opts)
  defp call_llm(config, messages, opts), do: call_openai(config, messages, opts)

  defp call_sdk(config, messages, _opts) do
    System.delete_env("CLAUDECODE")
    System.delete_env("CLAUDE_CODE_ENTRYPOINT")

    sdk_model = config[:sdk_model] || "sonnet"

    prompt =
      messages
      |> Enum.map(& &1["content"])
      |> Enum.join("\n\n")

    case ClaudeAgentSDK.Streaming.start_session(%ClaudeAgentSDK.Options{
           model: sdk_model,
           effort: :high,
           system_prompt: %{type: :preset, preset: :claude_code},
           permission_mode: :bypass_permissions,
           cwd: System.user_home!(),
           include_partial_messages: true
         }) do
      {:ok, session} ->
        response =
          session
          |> ClaudeAgentSDK.Streaming.send_message(prompt)
          |> Enum.reduce("", fn event, acc ->
            case Trinity.StreamEventParser.to_sse(event) do
              %{type: "text", content: text} -> acc <> text
              _ -> acc
            end
          end)

        ClaudeAgentSDK.Streaming.close_session(session)
        {:ok, %{content: response, input_tokens: 0, output_tokens: 0}}

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  defp call_openai(config, messages, opts) do
    body =
      %{
        "model" => config.model,
        "temperature" => opts[:temperature] || 0,
        "max_tokens" => opts[:max_tokens] || 1024,
        "messages" => messages
      }
      |> then(fn b ->
        if rf = opts[:response_format], do: Map.put(b, "response_format", rf), else: b
      end)

    case Req.post("#{config.base_url}/chat/completions",
           json: body,
           headers: [{"authorization", "Bearer #{config.api_key}"}],
           receive_timeout: opts[:timeout] || 60_000
         ) do
      {:ok, %{status: 200, body: resp}} ->
        {:ok,
         %{
           content: get_in(resp, ["choices", Access.at(0), "message", "content"]) || "",
           input_tokens: get_in(resp, ["usage", "prompt_tokens"]) || 0,
           output_tokens: get_in(resp, ["usage", "completion_tokens"]) || 0
         }}

      {:ok, %{status: s, body: b}} ->
        {:error, "API #{s}: #{inspect(b)}"}

      {:error, r} ->
        {:error, inspect(r)}
    end
  end

  defp call_anthropic(config, messages, opts) do
    {sys_msgs, chat_msgs} = Enum.split_with(messages, &(&1["role"] == "system"))
    system_text = Enum.map_join(sys_msgs, "\n\n", & &1["content"])

    body =
      %{"model" => config.model, "max_tokens" => opts[:max_tokens] || 1024, "messages" => chat_msgs}
      |> then(fn b -> if system_text != "", do: Map.put(b, "system", system_text), else: b end)
      |> then(fn b -> if t = opts[:temperature], do: Map.put(b, "temperature", t), else: b end)

    case Req.post("#{config.base_url}/messages",
           json: body,
           headers: [
             {"x-api-key", config.api_key},
             {"anthropic-version", "2023-06-01"},
             {"content-type", "application/json"}
           ],
           receive_timeout: opts[:timeout] || 60_000
         ) do
      {:ok, %{status: 200, body: resp}} ->
        {:ok,
         %{
           content: get_in(resp, ["content", Access.at(0), "text"]) || "",
           input_tokens: get_in(resp, ["usage", "input_tokens"]) || 0,
           output_tokens: get_in(resp, ["usage", "output_tokens"]) || 0
         }}

      {:ok, %{status: s, body: b}} ->
        {:error, "API #{s}: #{inspect(b)}"}

      {:error, r} ->
        {:error, inspect(r)}
    end
  end

  defp estimate_cost("sdk", _, _), do: 0.0

  defp estimate_cost("anthropic", input, output) do
    # Sonnet 4.6: $3/M input, $15/M output
    (input * 3.0 + output * 15.0) / 1_000_000
  end

  defp estimate_cost(_, input, output) do
    # DeepSeek: $0.14/M input, $0.28/M output
    (input * 0.14 + output * 0.28) / 1_000_000
  end

  defp parse_json(text) do
    text = String.trim(text)

    case Jason.decode(text) do
      {:ok, map} ->
        {:ok, map}

      _ ->
        # Strip markdown code fences
        stripped =
          text
          |> String.replace(~r/^```(?:json)?\s*/m, "")
          |> String.replace(~r/\s*```$/m, "")
          |> String.trim()

        case Jason.decode(stripped) do
          {:ok, map} ->
            {:ok, map}

          _ ->
            case Regex.run(~r/\{[\s\S]*\}/U, stripped) do
              [json_str] -> Jason.decode(json_str)
              nil -> {:error, "no JSON found in response"}
            end
        end
    end
  end

  # ── Answer extraction (ported from Python prepare.py) ──

  defp extract_number(text) do
    cond do
      (m = Regex.scan(~r/\\boxed\{([^}]+)\}/, text)) != [] ->
        m |> List.last() |> Enum.at(1) |> clean_num()

      (m = Regex.scan(~r/####\s*(.+)/, text)) != [] ->
        m |> List.last() |> Enum.at(1) |> clean_num()

      (m = Regex.scan(~r/(?:answer|result)\s*(?:is|=|:)\s*\$?(-?[\d,]+\.?\d*)/i, text)) != [] ->
        m |> List.last() |> Enum.at(1) |> clean_num()

      (m = Regex.scan(~r/-?[\d,]+\.?\d*/, text)) != [] ->
        m |> List.last() |> Enum.at(0) |> clean_num()

      true ->
        nil
    end
  end

  defp clean_num(s), do: s |> String.replace(",", "") |> String.trim()

  defp check_answer(nil, _), do: false

  defp check_answer(predicted, expected) do
    case {Float.parse(predicted), Float.parse(expected)} do
      {{p, _}, {e, _}} -> abs(p - e) < 0.001
      _ -> String.trim(predicted) == String.trim(expected)
    end
  end

  # ── Message builder ────────────────────────────────────

  defp build_messages(config, question) do
    msgs =
      case config["system_prompt"] do
        sp when is_binary(sp) and sp != "" -> [%{"role" => "system", "content" => sp}]
        _ -> []
      end

    msgs =
      (config["few_shot_examples"] || [])
      |> Enum.reduce(msgs, fn
        [q, a], acc ->
          acc ++ [%{"role" => "user", "content" => q}, %{"role" => "assistant", "content" => a}]

        _, acc ->
          acc
      end)

    fmt = config["format_instruction"] || ""
    content = if String.trim(fmt) != "", do: "#{question}\n\n#{fmt}", else: question
    msgs ++ [%{"role" => "user", "content" => content}]
  end

  # ── Data ───────────────────────────────────────────────

  defp load_problems do
    path = :code.priv_dir(:trinity) |> to_string() |> Path.join("evolvelab/gsm8k_eval.jsonl")

    path
    |> File.read!()
    |> String.split("\n", trim: true)
    |> Enum.map(&Jason.decode!/1)
  end

  defp extract_config(suggestion) do
    %{
      "system_prompt" => suggestion["system_prompt"] || @default_config["system_prompt"],
      "few_shot_examples" => suggestion["few_shot_examples"] || [],
      "format_instruction" => suggestion["format_instruction"] || @default_config["format_instruction"]
    }
  end

  # ── Helpers ────────────────────────────────────────────

  defp make_row(exp, result, elapsed, status, desc) do
    %{
      exp: exp,
      accuracy: result.accuracy,
      correct: "#{result.correct}/#{result.total}",
      cost: Float.round(result.cost + 0.0, 6),
      time_s: Float.round(elapsed + 0.0, 1),
      status: status,
      description: desc
    }
  end

  defp timed(fun) do
    t0 = System.monotonic_time(:millisecond)
    result = fun.()
    elapsed = (System.monotonic_time(:millisecond) - t0) / 1000
    {result, elapsed}
  end

  defp broadcast(id, event) do
    Phoenix.PubSub.broadcast(Trinity.PubSub, "evolvelab:#{id}", {:evolvelab_event, event})
  end
end
