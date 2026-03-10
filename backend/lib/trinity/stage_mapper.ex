defmodule Trinity.StageMapper do
  @moduledoc "Maps raw tool names to user-friendly stage labels."

  @tool_labels %{
    "Read" => "Reading Files",
    "Edit" => "Editing Files",
    "Write" => "Writing Files",
    "MultiEdit" => "Editing Files",
    "Bash" => "Running Command",
    "Grep" => "Searching Code",
    "Glob" => "Finding Files",
    "Agent" => "Sub-Agent",
    "WebSearch" => "Web Search",
    "WebFetch" => "Fetching URL",
    "TodoWrite" => "Managing Tasks",
    "NotebookEdit" => "Editing Notebook",
    "Skill" => "Executing Skill",
    "ToolSearch" => "Loading Tools",
    "AskUserQuestion" => "Asking User"
  }

  def tool_to_stage(tool_name) do
    Map.get(@tool_labels, tool_name, tool_name)
  end
end
