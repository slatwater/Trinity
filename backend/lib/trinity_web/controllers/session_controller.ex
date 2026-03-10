defmodule TrinityWeb.SessionController do
  use TrinityWeb, :controller

  def show(conn, %{"id" => id}) do
    json(conn, %{alive: Trinity.ClaudeSession.alive?(id)})
  end

  def show(conn, _params) do
    json(conn, %{alive: false})
  end

  def delete(conn, %{"sessionId" => session_id}) when is_binary(session_id) do
    Trinity.ClaudeSession.stop(session_id)
    json(conn, %{ok: true})
  end

  def delete(conn, _params) do
    json(conn, %{ok: true})
  end

  def messages(conn, %{"id" => id}) do
    {messages, status} = Trinity.ClaudeSession.get_messages(id)
    json(conn, %{messages: messages, status: to_string(status)})
  end

  def messages(conn, _params) do
    json(conn, %{messages: [], status: "idle"})
  end

  def workflows(conn, _params) do
    sessions = Registry.select(Trinity.SessionRegistry, [{{:"$1", :"$2", :_}, [], [{{:"$1", :"$2"}}]}])

    workflows =
      sessions
      |> Enum.map(fn {project_id, _pid} ->
        Trinity.ClaudeSession.get_workflow(project_id)
      end)
      |> Enum.reject(&is_nil/1)
      |> Enum.filter(fn w -> w.status == "busy" or length(w.stages) > 0 end)

    json(conn, %{workflows: workflows})
  end
end
