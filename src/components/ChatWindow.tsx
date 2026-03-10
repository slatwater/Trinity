"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat";
import { MessageBubble } from "./MessageBubble";
import { Project, Message } from "@/lib/types";

export function ChatWindow({ project }: { project: Project }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { sessions, isLoading, addMessage, appendToLastMessage, setLoading } = useChatStore();

  const messages = sessions[project.id] || [];
  const loading = isLoading[project.id] || false;

  // Fetch messages from backend and apply to store
  const fetchAndApply = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?id=${project.id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const backendMsgs: { role: string; content: string }[] = data.messages || [];
      const status: string = data.status || "idle";

      if (backendMsgs.length > 0) {
        useChatStore.setState((state) => {
          const newMsgs: Message[] = backendMsgs.map((m, i) => ({
            id: `msg-${i}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date().toISOString(),
            isStreaming: status === "busy" && i === backendMsgs.length - 1 && m.role === "assistant",
          }));
          const sessions = { ...state.sessions, [project.id]: newMsgs };
          return { sessions };
        });
      }

      return status;
    } catch {
      return null;
    }
  }, [project.id]);

  // On mount: fetch backend messages, poll if busy
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const status = await fetchAndApply();

      if (status === "busy" && !cancelled) {
        // Task is running, poll for updates
        pollRef.current = setInterval(async () => {
          const s = await fetchAndApply();
          if (s !== "busy" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 2000);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [project.id, fetchAndApply]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [project.id]);

  // Abort fetch on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    addMessage(project.id, userMsg);

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    addMessage(project.id, assistantMsg);
    setLoading(project.id, true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: project.path,
          prompt,
          sessionId: project.id,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No reader");

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "done") break;
              if (data.type === "error") {
                appendToLastMessage(project.id, `\n[Error: ${data.content}]`);
                break;
              }
              if (data.content) {
                appendToLastMessage(project.id, data.content);
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch {
      // SSE disconnected — backend continues, poll will pick up the result
    } finally {
      abortRef.current = null;
      setLoading(project.id, false);
      // Remove streaming indicator
      useChatStore.setState((state) => {
        const msgs = state.sessions[project.id] || [];
        if (msgs.length === 0) return state;
        const last = msgs[msgs.length - 1];
        return {
          sessions: {
            ...state.sessions,
            [project.id]: [...msgs.slice(0, -1), { ...last, isStreaming: false }],
          },
        };
      });

      // Start polling to get complete response from backend
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const s = await fetchAndApply();
        if (s !== "busy" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center" style={{ color: "var(--text-secondary)" }}>
              <div className="text-4xl mb-4 opacity-20">{">"}_</div>
              <p className="text-sm">Send a message to start chatting with Claude</p>
              <p className="text-xs mt-2 opacity-60">
                Working in: {project.path}
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
            rows={3}
            className="flex-1 resize-none rounded-lg px-4 py-3 text-sm outline-none placeholder:opacity-40"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="self-end px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
