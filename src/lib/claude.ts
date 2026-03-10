import { spawn, ChildProcess } from "child_process";

export interface ClaudeOptions {
  projectPath: string;
  prompt: string;
  onData: (data: ClaudeStreamChunk) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export interface ClaudeStreamChunk {
  type: "text" | "tool_use" | "tool_result" | "system" | "error";
  content: string;
  tool?: string;
}

const activeProcesses = new Map<string, ChildProcess>();

export function startClaudeChat(sessionId: string, options: ClaudeOptions) {
  const { projectPath, prompt, onData, onDone, onError } = options;

  const proc = spawn("claude", ["-p", prompt, "--output-format", "stream-json"], {
    cwd: projectPath,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  activeProcesses.set(sessionId, proc);

  let buffer = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const parsed = parseStreamEvent(event);
        if (parsed) onData(parsed);
      } catch {
        // Non-JSON output, treat as plain text
        onData({ type: "text", content: line });
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.trim()) {
      onData({ type: "system", content: text });
    }
  });

  proc.on("close", () => {
    activeProcesses.delete(sessionId);
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        const parsed = parseStreamEvent(event);
        if (parsed) onData(parsed);
      } catch {
        onData({ type: "text", content: buffer });
      }
    }
    onDone();
  });

  proc.on("error", (err) => {
    activeProcesses.delete(sessionId);
    onError(err.message);
  });

  return sessionId;
}

export function stopClaudeChat(sessionId: string) {
  const proc = activeProcesses.get(sessionId);
  if (proc) {
    proc.kill("SIGTERM");
    activeProcesses.delete(sessionId);
  }
}

function parseStreamEvent(event: Record<string, unknown>): ClaudeStreamChunk | null {
  // Claude CLI stream-json format
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
      if (event.result && typeof event.result === "string") {
        return { type: "text", content: event.result };
      }
      if (event.result && typeof event.result === "object") {
        const result = event.result as Record<string, unknown>;
        if (result.text) return { type: "text", content: result.text as string };
      }
      return null;

    default:
      return null;
  }
}
