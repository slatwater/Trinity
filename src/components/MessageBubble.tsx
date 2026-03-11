"use client";

import { Message } from "@/lib/types";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {/* AI avatar */}
      {!isUser && !isSystem && (
        <div
          className="shrink-0 flex items-center justify-center font-semibold"
          style={{
            width: 28, height: 28, borderRadius: 8, marginRight: 12, marginTop: 2,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            fontSize: 11,
            color: "var(--accent)",
            fontFamily: "var(--font-serif)",
          }}
        >
          T
        </div>
      )}

      <div
        className="text-sm leading-[1.75] whitespace-pre-wrap"
        style={{
          maxWidth: isUser ? "55%" : "82%",
          padding: isUser ? "12px 20px" : "18px 24px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser
            ? "var(--user-bubble-bg)"
            : isSystem
              ? "var(--system-bubble-bg)"
              : "var(--ai-bubble-bg)",
          border: `1px solid ${
            isUser
              ? "var(--user-bubble-border)"
              : isSystem
                ? "var(--system-bubble-border)"
                : "var(--ai-bubble-border)"
          }`,
          color: isUser
            ? "var(--user-bubble-color)"
            : isSystem
              ? "var(--warning)"
              : "var(--ai-bubble-color)",
          fontFamily: "var(--font-sans)",
          boxShadow: !isUser && !isSystem ? "var(--ai-bubble-shadow)" : "none",
        }}
      >
        {message.content.split("\n").map((line, li) => {
          if (line.startsWith("### ")) {
            return (
              <div
                key={li}
                className="text-[13px] font-semibold"
                style={{
                  color: "var(--text-secondary)",
                  marginTop: li > 0 ? 16 : 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-serif)",
                  letterSpacing: "-0.01em",
                }}
              >
                {line.replace("### ", "")}
              </div>
            );
          }
          if (line.match(/^\d\./)) {
            return (
              <div key={li} className="text-[13px] mb-1 pl-1" style={{ color: "var(--text-secondary)" }}>
                {line}
              </div>
            );
          }
          return (
            <div key={li} style={{ marginBottom: line === "" ? 8 : 2 }}>
              {line}
            </div>
          );
        })}
        {message.isStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-0.5 animate-pulse"
            style={{ background: "var(--accent)" }}
          />
        )}
      </div>
    </div>
  );
}
