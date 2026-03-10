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
end
