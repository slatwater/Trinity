defmodule TrinityWeb.ChatController do
  use TrinityWeb, :controller
  require Logger

  def create(conn, %{"projectPath" => project_path, "prompt" => prompt} = params) do
    session_id = params["sessionId"] || Base.url_encode64(project_path, padding: false)

    # Ensure session exists
    case ensure_session(session_id, project_path) do
      {:ok, _pid} ->
        # Subscribe to session events
        topic = "session:#{session_id}"
        Phoenix.PubSub.subscribe(Trinity.PubSub, topic)

        # Tell session to process the message (handle dead GenServer)
        case safe_send_message(session_id, project_path, prompt) do
          {:ok, ^topic} ->
            conn
            |> put_resp_content_type("text/event-stream")
            |> put_resp_header("cache-control", "no-cache")
            |> put_resp_header("connection", "keep-alive")
            |> send_chunked(200)
            |> stream_loop(session_id)

          {:error, reason} ->
            Phoenix.PubSub.unsubscribe(Trinity.PubSub, topic)
            conn
            |> put_status(500)
            |> json(%{error: "Session error: #{inspect(reason)}"})
        end

      {:error, reason} ->
        conn
        |> put_status(500)
        |> json(%{error: "Failed to start session: #{inspect(reason)}"})
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(400)
    |> json(%{error: "Missing projectPath or prompt"})
  end

  defp stream_loop(conn, session_id) do
    receive do
      {:stream_event, %{type: "done"} = event} ->
        chunk(conn, "data: #{Jason.encode!(event)}\n\n")
        Phoenix.PubSub.unsubscribe(Trinity.PubSub, "session:#{session_id}")
        conn

      {:stream_event, event} ->
        case chunk(conn, "data: #{Jason.encode!(event)}\n\n") do
          {:ok, conn} -> stream_loop(conn, session_id)
          {:error, _} -> conn
        end
    after
      300_000 ->
        chunk(conn, "data: #{Jason.encode!(%{type: "error", content: "Timed out after 5 minutes"})}\n\n")
        chunk(conn, "data: #{Jason.encode!(%{type: "done"})}\n\n")
        conn
    end
  end

  defp safe_send_message(session_id, project_path, prompt) do
    try do
      Trinity.ClaudeSession.send_message(session_id, prompt)
    catch
      :exit, {:noproc, _} ->
        # GenServer died, restart and retry
        Logger.warning("[ChatController] Session dead, restarting for #{session_id}")
        case restart_session(session_id, project_path) do
          {:ok, _pid} ->
            try do
              Trinity.ClaudeSession.send_message(session_id, prompt)
            catch
              :exit, reason -> {:error, reason}
            end

          {:error, reason} ->
            {:error, reason}
        end

      :exit, reason ->
        {:error, reason}
    end
  end

  defp restart_session(session_id, project_path) do
    Trinity.ClaudeSession.stop(session_id)
    DynamicSupervisor.start_child(
      Trinity.SessionManager,
      {Trinity.ClaudeSession, {session_id, project_path, []}}
    )
  end

  defp ensure_session(session_id, project_path) do
    case Registry.lookup(Trinity.SessionRegistry, session_id) do
      [{pid, _}] ->
        {:ok, pid}

      [] ->
        DynamicSupervisor.start_child(
          Trinity.SessionManager,
          {Trinity.ClaudeSession, {session_id, project_path, []}}
        )
    end
  end
end
