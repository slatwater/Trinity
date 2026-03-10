import { spawn, ChildProcess } from "child_process";

export interface ClaudeOptions {
  projectPath: string;
  prompt: string;
  model?: string;
  sessionId?: string;
  onData: (data: ClaudeStreamChunk) => void;
  onDone: (meta: { sessionId?: string }) => void;
  onError: (error: string) => void;
}

export interface ClaudeStreamChunk {
  type: "text" | "tool_use" | "tool_result" | "system" | "error";
  content: string;
  tool?: string;
}

const activeProcesses = new Map<string, ChildProcess>();

// Map projectId -> claude session_id for multi-turn resume
const sessionMap = new Map<string, string>();

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

/**
 * Send a message to Claude using `--print -` mode (stdin prompt, piped stdout).
 * Supports multi-turn via `--resume` with session ID from previous response.
 * Real-time streaming via stdout pipe — no file polling, no PTY needed.
 */
export function sendMessage(id: string, options: ClaudeOptions) {
  const { projectPath, prompt, model, onData, onDone, onError } = options;

  const args = ["--print", "-", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"];

  if (model) args.push("--model", model);

  // Resume previous session for multi-turn context
  const prevSession = sessionMap.get(id);
  if (prevSession) args.push("--resume", prevSession);

  const proc = spawn("claude", args, {
    cwd: projectPath,
    env: cleanEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  activeProcesses.set(id, proc);

  let buffer = "";
  let claudeSessionId: string | undefined;

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);

        // Extract session ID for resume
        if (event.type === "system" && event.session_id) {
          claudeSessionId = event.session_id;
        }
        if (event.session_id && !claudeSessionId) {
          claudeSessionId = event.session_id;
        }

        const parsed = parseStreamEvent(event);
        if (parsed) onData(parsed);
      } catch {
        if (line.trim()) onData({ type: "system", content: line });
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) onData({ type: "system", content: text });
  });

  proc.on("close", () => {
    activeProcesses.delete(id);

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        const parsed = parseStreamEvent(event);
        if (parsed) onData(parsed);
        if (event.session_id) claudeSessionId = event.session_id;
      } catch { /* ignore */ }
    }

    // Save session ID for multi-turn resume
    if (claudeSessionId) {
      sessionMap.set(id, claudeSessionId);
    }

    onDone({ sessionId: claudeSessionId });
  });

  proc.on("error", (err) => {
    activeProcesses.delete(id);
    onError(err.message);
  });

  // Write prompt to stdin and close
  proc.stdin.write(prompt);
  proc.stdin.end();

  // Safety timeout: 5 minutes
  setTimeout(() => {
    if (activeProcesses.has(id)) {
      onData({ type: "system", content: "\n[Timed out after 5 minutes]" });
      proc.kill("SIGTERM");
    }
  }, 300000);
}

export function stopSession(id: string) {
  const proc = activeProcesses.get(id);
  if (proc) {
    proc.kill("SIGTERM");
    activeProcesses.delete(id);
  }
}

export function clearSessionHistory(id: string) {
  sessionMap.delete(id);
}

function parseStreamEvent(event: Record<string, unknown>): ClaudeStreamChunk | null {
  switch (event.type) {
    case "assistant":
      if (event.message && typeof event.message === "object") {
        const msg = event.message as Record<string, unknown>;
        if (Array.isArray(msg.content)) {
          const textBlocks = (msg.content as Array<Record<string, unknown>>)
            .filter((b) => b.type === "text")
            .map((b) => b.text as string);
          if (textBlocks.length > 0) {
            return { type: "text", content: textBlocks.join("") };
          }
          const toolBlocks = (msg.content as Array<Record<string, unknown>>)
            .filter((b) => b.type === "tool_use");
          if (toolBlocks.length > 0) {
            const t = toolBlocks[0];
            return {
              type: "tool_use",
              content: JSON.stringify(t.input || {}),
              tool: t.name as string,
            };
          }
        }
      }
      return null;

    case "content_block_delta":
      if (event.delta && typeof event.delta === "object") {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === "text_delta" && delta.text) {
          return { type: "text", content: delta.text as string };
        }
      }
      return null;

    case "result":
      // Content already emitted via assistant event
      return null;

    default:
      return null;
  }
}
