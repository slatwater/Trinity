import { NextRequest } from "next/server";
import { startClaudeChat, ClaudeStreamChunk } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { projectPath, prompt, sessionId } = await req.json();

  if (!projectPath || !prompt) {
    return new Response(JSON.stringify({ error: "Missing projectPath or prompt" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const id = sessionId || crypto.randomUUID();

      startClaudeChat(id, {
        projectPath,
        prompt,
        onData: (chunk: ClaudeStreamChunk) => {
          const data = JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        },
        onDone: () => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        },
        onError: (error: string) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", content: error })}\n\n`)
          );
          controller.close();
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
