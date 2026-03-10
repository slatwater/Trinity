defmodule Trinity.StreamEventParser do
  @moduledoc """
  Maps ClaudeAgentSDK streaming events to SSE JSON format
  expected by the Trinity frontend.
  """

  def to_sse(%{type: :text_delta, text: text}) do
    %{type: "text", content: text}
  end

  def to_sse(%{type: :tool_use_start, name: name}) do
    %{type: "tool_use", tool: name}
  end

  def to_sse(%{type: :error, error: reason}) do
    %{type: "error", content: inspect(reason)}
  end

  def to_sse(%{type: :message_stop}) do
    nil
  end

  # Ignore other event types (message_start, content_block_start, etc.)
  def to_sse(_event), do: nil
end
