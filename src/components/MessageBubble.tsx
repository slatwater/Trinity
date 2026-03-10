"use client";

import { Message } from "@/lib/types";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className="max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
        style={{
          background: isUser
            ? "var(--accent)"
            : isSystem
              ? "rgba(234,179,8,0.1)"
              : "var(--bg-tertiary)",
          color: isUser
            ? "#fff"
            : isSystem
              ? "var(--warning)"
              : "var(--text-primary)",
          border: isSystem ? "1px solid rgba(234,179,8,0.2)" : "none",
        }}
      >
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 animate-pulse" style={{ background: "var(--accent)" }} />
        )}
      </div>
    </div>
  );
}
