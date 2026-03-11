defmodule TrinityWeb.AutoPilotController do
  use TrinityWeb, :controller
  require Logger

  # POST /api/autopilot
  def create(conn, %{"projectId" => project_id, "projectPath" => project_path, "requirement" => requirement}) do
    id = Base.url_encode64(:crypto.strong_rand_bytes(8), padding: false)

    case DynamicSupervisor.start_child(
           Trinity.AutoPilotManager,
           {Trinity.AutoPilot, {id, project_id, project_path, requirement}}
         ) do
      {:ok, _pid} ->
        {agent_a_id, agent_b_id, _} = Trinity.AutoPilot.get_agent_ids(id)
        json(conn, %{id: id, agent_a_id: agent_a_id, agent_b_id: agent_b_id})

      {:error, reason} ->
        conn |> put_status(500) |> json(%{error: inspect(reason)})
    end
  end

  def create(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Missing projectId, projectPath, or requirement"})
  end

  # GET /api/autopilot/:id
  def show(conn, %{"id" => id}) do
    if Trinity.AutoPilot.alive?(id) do
      status = Trinity.AutoPilot.get_status(id)
      json(conn, status)
    else
      conn |> put_status(404) |> json(%{error: "Not found"})
    end
  end

  # POST /api/autopilot/:id/message — SSE streaming response
  def message(conn, %{"id" => id, "content" => content}) do
    if not Trinity.AutoPilot.alive?(id) do
      conn |> put_status(404) |> json(%{error: "Not found"})
    else
      {agent_a_id, _, _} = Trinity.AutoPilot.get_agent_ids(id)
      msg_ref = Base.url_encode64(:crypto.strong_rand_bytes(8), padding: false)
      topic = "session:#{agent_a_id}:#{msg_ref}"
      Phoenix.PubSub.subscribe(Trinity.PubSub, topic)

      # During clarification, wrap user message with constraint reminder
      prompt =
        case Trinity.AutoPilot.get_status(id) do
          %{phase: "clarifying"} ->
            "【你仍在澄清阶段，禁止写代码、禁止使用工具，只能继续提问或回复「需求已清楚，等待确认」】\n\n用户回复：#{content}"

          _ ->
            content
        end

      case safe_send(agent_a_id, prompt, topic) do
        {:ok, ^topic} ->
          conn
          |> put_resp_content_type("text/event-stream")
          |> put_resp_header("cache-control", "no-cache")
          |> put_resp_header("connection", "keep-alive")
          |> send_chunked(200)
          |> stream_loop(topic)

        {:error, reason} ->
          Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
          conn |> put_status(500) |> json(%{error: inspect(reason)})
      end
    end
  end

  def message(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Missing content"})
  end

  # POST /api/autopilot/:id/confirm
  def confirm(conn, %{"id" => id}) do
    if Trinity.AutoPilot.alive?(id) do
      Trinity.AutoPilot.confirm(id)
      json(conn, %{ok: true})
    else
      conn |> put_status(404) |> json(%{error: "Not found"})
    end
  end

  # DELETE /api/autopilot/:id
  def delete(conn, %{"id" => id}) do
    Trinity.AutoPilot.cancel(id)
    json(conn, %{ok: true})
  end

  # --- SSE Helpers (same pattern as ChatController) ---

  defp stream_loop(conn, topic) do
    receive do
      {:stream_event, %{type: "done"} = event} ->
        chunk(conn, "data: #{Jason.encode!(event)}\n\n")
        Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
        conn

      {:stream_event, event} ->
        case chunk(conn, "data: #{Jason.encode!(event)}\n\n") do
          {:ok, conn} -> stream_loop(conn, topic)
          {:error, _} -> conn
        end
    after
      300_000 ->
        chunk(conn, "data: #{Jason.encode!(%{type: "error", content: "Timed out"})}\n\n")
        chunk(conn, "data: #{Jason.encode!(%{type: "done"})}\n\n")
        conn
    end
  end

  defp safe_send(session_id, prompt, topic) do
    try do
      Trinity.ClaudeSession.send_message(session_id, prompt, topic)
    catch
      :exit, reason -> {:error, reason}
    end
  end
end
