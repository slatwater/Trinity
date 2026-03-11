"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "@/stores/chat";
import { MessageBubble } from "./MessageBubble";
import { Project, Message } from "@/lib/types";

export function ChatWindow({ project }: { project: Project }) {
  const [input, setInput] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = useRef(false);

  const { sessions, isLoading, addMessage, appendToLastMessage, setLoading } = useChatStore();

  const messages = sessions[project.id] || [];
  const loading = isLoading[project.id] || false;

  const fetchAndApply = useCallback(async () => {
    if (sendingRef.current) return null;
    try {
      const res = await fetch(`/api/messages?id=${project.id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const backendMsgs: { role: string; content: string }[] = data.messages || [];
      const status: string = data.status || "idle";

      if (backendMsgs.length > 0) {
        useChatStore.setState((state) => {
          const currentMsgs = state.sessions[project.id] || [];
          if (backendMsgs.length < currentMsgs.length) return state;

          if (backendMsgs.length === currentMsgs.length) {
            const same = backendMsgs.every(
              (m, i) => m.role === currentMsgs[i].role && m.content === currentMsgs[i].content
            );
            if (same && !(status === "busy" && !currentMsgs[currentMsgs.length - 1]?.isStreaming)) {
              return state;
            }
          }

          const newMsgs: Message[] = backendMsgs.map((m, i) => ({
            id: currentMsgs[i]?.id || `msg-${i}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: currentMsgs[i]?.timestamp || new Date().toISOString(),
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

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const status = await fetchAndApply();
      if (status === "busy" && !cancelled) {
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
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [project.id, fetchAndApply]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, [project.id]);
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    sendingRef.current = true;
    setInput("");

    addMessage(project.id, { id: crypto.randomUUID(), role: "user", content: prompt, timestamp: new Date().toISOString() });
    addMessage(project.id, { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date().toISOString(), isStreaming: true });
    setLoading(project.id, true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath: project.path, prompt, sessionId: project.id }),
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
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "done") { setActiveTool(null); break; }
              if (data.type === "error") { setActiveTool(null); appendToLastMessage(project.id, `\n[Error: ${data.content}]`); break; }
              if (data.type === "tool_use" && data.tool) { setActiveTool(data.tool); }
              else if (data.content) { setActiveTool(null); appendToLastMessage(project.id, data.content); }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* SSE disconnected */ }
    finally {
      abortRef.current = null;
      setActiveTool(null);
      setLoading(project.id, false);
      useChatStore.setState((state) => {
        const msgs = state.sessions[project.id] || [];
        if (msgs.length === 0) return state;
        const last = msgs[msgs.length - 1];
        return { sessions: { ...state.sessions, [project.id]: [...msgs.slice(0, -1), { ...last, isStreaming: false }] } };
      });
      setTimeout(() => {
        sendingRef.current = false;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          const s = await fetchAndApply();
          if (s !== "busy" && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }, 2000);
      }, 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: "32px 32px 16px" }}>
        <div className="mx-auto" style={{ maxWidth: 860, width: "100%" }}>
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center" style={{ color: "var(--text-secondary)" }}>
                <div className="text-4xl mb-4 opacity-20" style={{ fontFamily: "var(--font-mono)" }}>{">"}_</div>
                <p className="text-sm">Send a message to start chatting with Claude</p>
                <p className="text-xs mt-2 opacity-60" style={{ fontFamily: "var(--font-mono)" }}>{project.path}</p>
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {activeTool && (
            <div
              className="flex items-center gap-2 px-4 py-2 mb-2 rounded-lg text-xs"
              style={{ background: "var(--stage-active-bg)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
              {activeTool}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0" style={{ padding: "16px 32px 24px" }}>
        <div className="mx-auto relative" style={{ maxWidth: 860 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            className="w-full outline-none transition-all duration-300"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "14px 100px 14px 20px",
              color: "var(--text-primary)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent-focus)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <div className="absolute flex items-center gap-1" style={{ right: 14, top: "50%", transform: "translateY(-50%)" }}>
            <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Enter &crarr;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
