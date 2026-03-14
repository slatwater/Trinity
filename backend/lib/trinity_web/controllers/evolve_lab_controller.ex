defmodule TrinityWeb.EvolveLabController do
  use TrinityWeb, :controller

  def create(conn, params) do
    strategy = %{
      provider: get_in(params, ["strategy", "provider"]) || "openai",
      api_key: get_in(params, ["strategy", "apiKey"]) || "",
      base_url: get_in(params, ["strategy", "baseUrl"]) || "",
      model: get_in(params, ["strategy", "model"]) || "",
      sdk_model: get_in(params, ["strategy", "sdkModel"]) || "sonnet"
    }

    target = %{
      provider: get_in(params, ["target", "provider"]) || "openai",
      api_key: get_in(params, ["target", "apiKey"]),
      base_url: get_in(params, ["target", "baseUrl"]),
      model: get_in(params, ["target", "model"])
    }

    judge = case params["judge"] do
      nil -> nil
      j -> %{
        provider: j["provider"] || "sdk",
        sdk_model: j["sdkModel"] || "sonnet",
        api_key: j["apiKey"] || "",
        base_url: j["baseUrl"] || "",
        model: j["model"] || ""
      }
    end

    num_experiments = params["numExperiments"] || 5
    max_concurrent = params["maxConcurrent"] || 5
    template = params["template"] || %{}

    id = Base.url_encode64(:crypto.strong_rand_bytes(8), padding: false)
    topic = "evolvelab:#{id}"

    Phoenix.PubSub.subscribe(Trinity.PubSub, topic)

    # Parse default_config from template (keys come as camelCase from frontend)
    default_config =
      case template["defaultConfig"] do
        %{"system_prompt" => _} = cfg -> cfg
        %{"systemPrompt" => sp} = cfg ->
          %{
            "system_prompt" => sp,
            "few_shot_examples" => cfg["fewShotExamples"] || cfg["few_shot_examples"] || [],
            "format_instruction" => cfg["formatInstruction"] || cfg["format_instruction"] || ""
          }
        _ -> nil
      end

    {:ok, _pid} =
      DynamicSupervisor.start_child(
        Trinity.EvolveLabManager,
        {Trinity.EvolveLab,
         %{
           id: id, strategy: strategy, target: target,
           num_experiments: num_experiments, max_concurrent: max_concurrent, judge: judge,
           dataset: template["dataset"],
           check_mode: template["checkMode"],
           judge_prompt: template["judgePrompt"],
           strategy_hint: template["strategyHint"],
           default_config: default_config,
           score_max: template["scoreMax"]
         }}
      )

    conn
    |> put_resp_content_type("text/event-stream")
    |> put_resp_header("cache-control", "no-cache")
    |> put_resp_header("connection", "keep-alive")
    |> send_chunked(200)
    |> then(fn conn ->
      {:ok, conn} = chunk(conn, "data: #{Jason.encode!(%{type: "started", id: id})}\n\n")
      stream_loop(conn, topic)
    end)
  end

  def delete(conn, %{"id" => id}) do
    Trinity.EvolveLab.cancel(id)
    json(conn, %{ok: true})
  end

  def dataset(conn, %{"name" => name}) do
    if String.contains?(name, "..") or String.contains?(name, "/") do
      conn |> put_status(400) |> json(%{error: "invalid"})
    else
      path = :code.priv_dir(:trinity) |> to_string() |> Path.join("evolvelab/#{name}")
      case File.read(path) do
        {:ok, content} ->
          problems = content |> String.split("\n", trim: true) |> Enum.map(&Jason.decode!/1)
          json(conn, problems)
        {:error, _} ->
          conn |> put_status(404) |> json(%{error: "not found"})
      end
    end
  end

  def dataset(conn, _params) do
    conn |> put_status(400) |> json(%{error: "name required"})
  end

  defp stream_loop(conn, topic) do
    receive do
      {:evolvelab_event, %{type: type} = event} when type in ["done", "error"] ->
        chunk(conn, "data: #{Jason.encode!(event)}\n\n")
        Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
        conn

      {:evolvelab_event, event} ->
        case chunk(conn, "data: #{Jason.encode!(event)}\n\n") do
          {:ok, conn} -> stream_loop(conn, topic)
          {:error, _} -> Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
        end
    after
      600_000 ->
        chunk(conn, "data: #{Jason.encode!(%{type: "error", message: "timeout"})}\n\n")
        Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
        conn
    end
  end
end
