import { NextRequest, NextResponse } from "next/server";
import { startClaudeChat, stopClaudeChat, ClaudeStreamChunk } from "@/lib/claude";

interface TaskRecord {
  id: string;
  projectPath: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  result: string;
  createdAt: string;
  completedAt?: string;
}

// In-memory task store (will be replaced with persistent storage later)
const tasks = new Map<string, TaskRecord>();

export async function GET() {
  const allTasks = Array.from(tasks.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json({ tasks: allTasks });
}

export async function POST(req: NextRequest) {
  const { projectPath, prompt } = await req.json();

  if (!projectPath || !prompt) {
    return NextResponse.json({ error: "Missing projectPath or prompt" }, { status: 400 });
  }

  const taskId = crypto.randomUUID();
  const task: TaskRecord = {
    id: taskId,
    projectPath,
    prompt,
    status: "running",
    result: "",
    createdAt: new Date().toISOString(),
  };

  tasks.set(taskId, task);

  // Run in background (fire and forget)
  startClaudeChat(taskId, {
    projectPath,
    prompt,
    onData: (chunk: ClaudeStreamChunk) => {
      const t = tasks.get(taskId);
      if (t && chunk.content) {
        t.result += chunk.content;
      }
    },
    onDone: () => {
      const t = tasks.get(taskId);
      if (t) {
        t.status = "completed";
        t.completedAt = new Date().toISOString();
      }
    },
    onError: (error: string) => {
      const t = tasks.get(taskId);
      if (t) {
        t.status = "failed";
        t.result += `\nError: ${error}`;
        t.completedAt = new Date().toISOString();
      }
    },
  });

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest) {
  const { taskId } = await req.json();
  if (taskId) {
    stopClaudeChat(taskId);
    tasks.delete(taskId);
  }
  return NextResponse.json({ ok: true });
}
