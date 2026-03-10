import { NextRequest } from "next/server";
import { sendMessage, ClaudeStreamChunk } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { projectPath, prompt, sessionId, model } = await req.json();

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

      sendMessage(id, {
        projectPath,
        prompt,
        model,
        onData: (chunk: ClaudeStreamChunk) => {
          const data = JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        },
        onDone: (meta) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", sessionId: meta.sessionId })}\n\n`));
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
