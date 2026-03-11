"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { AutoPilotStatus, AutoPilotPhase, WorkflowStage } from "@/lib/types";

const PHASES: { key: AutoPilotPhase; label: string }[] = [
  { key: "clarifying", label: "Clarify" },
  { key: "generating_spec", label: "Spec" },
  { key: "writing_tests", label: "Tests" },
  { key: "waiting_merge", label: "Merge" },
  { key: "writing_code", label: "Code" },
  { key: "waiting_ci", label: "CI" },
  { key: "merging", label: "Release" },
  { key: "done", label: "Done" },
];

export function AutoPilotPanel({
  autopilotId,
  onClose,
}: {
  autopilotId: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<AutoPilotStatus | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(Date.now());

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot/${autopilotId}`);
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, [autopilotId]);

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [pollStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status?.agent_a?.messages, streamingText]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Elapsed timer — stops when done
  useEffect(() => {
    if (status?.phase === "done" || status?.phase === "error") return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status?.phase]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setInput("");
    setSending(true);
    setIsStreaming(true);
    setStreamingText("");

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch(`/api/autopilot/${autopilotId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No reader");

      let accumulated = "";
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
              if (data.type === "done") { done = true; break; }
              if (data.type === "text" && data.content) {
                accumulated += data.content;
                setStreamingText(accumulated);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* disconnected */ }
    finally {
      abortRef.current = null;
      setSending(false);
      setIsStreaming(false);
      setStreamingText("");
      pollStatus();
    }
  };

  const handleConfirm = async () => {
    await fetch(`/api/autopilot/${autopilotId}/confirm`, { method: "POST" });
    pollStatus();
  };

  const handleCancel = async () => {
    await fetch(`/api/autopilot/${autopilotId}`, { method: "DELETE" });
    onClose();
  };

  if (!status) {
    return (
      <div
        className="mt-8 p-6"
        style={{
          borderRadius: 16,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading...</div>
      </div>
    );
  }

  const displayPhase = status.phase === "fixing" ? "waiting_ci" : status.phase as AutoPilotPhase;
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === displayPhase);
  const clarifyMessages = (status.agent_a?.messages || []).slice(1);

  return (
    <section
      className="mt-8 overflow-hidden"
      style={{
        borderRadius: 16,
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2
            className="text-xs font-semibold uppercase tracking-wider shrink-0"
            style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
          >
            Auto Pilot
          </h2>
          <span
            className="text-[10px] shrink-0 tabular-nums"
            style={{
              color: status.phase === "done" ? "var(--success)" : "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              background: status.phase === "done" ? "var(--stage-done-bg)" : "var(--timer-bg)",
              border: `1px solid ${status.phase === "done" ? "var(--confirm-border)" : "var(--timer-border)"}`,
              padding: "3px 10px",
              borderRadius: 6,
            }}
          >
            {formatElapsed(elapsed)}
          </span>
          <span
            className="text-xs truncate"
            style={{ color: "var(--text-muted)" }}
          >
            {status.requirement}
          </span>
        </div>
        {status.phase !== "done" && (
          <button
            onClick={handleCancel}
            className="text-xs shrink-0 ml-2 cursor-pointer transition-colors duration-300"
            style={{
              color: "var(--text-muted)",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "5px 14px",
              fontFamily: "var(--font-mono)",
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Phase indicator bar */}
      <div
        className="flex items-center gap-1 overflow-x-auto"
        style={{ padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)" }}
      >
        {PHASES.map((phase, i) => (
          <Fragment key={phase.key}>
            {i > 0 && <PhaseArrow />}
            <PhaseStep
              label={phase.label}
              state={
                i < currentPhaseIndex || status.phase === "done"
                  ? "completed"
                  : i === currentPhaseIndex
                    ? "active"
                    : "pending"
              }
            />
          </Fragment>
        ))}
      </div>

      {/* Clarification chat */}
      {status.phase === "clarifying" && (
        <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="max-h-80 overflow-y-auto p-4 space-y-3">
            {clarifyMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                style={{ animation: `msgIn 0.4s ${i * 0.05}s both` }}
              >
                {msg.role !== "user" && (
                  <div
                    className="shrink-0 flex items-center justify-center font-semibold"
                    style={{
                      width: 24, height: 24, borderRadius: 6, marginRight: 10, marginTop: 2,
                      background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
                      fontSize: 10, color: "var(--accent)", fontFamily: "var(--font-serif)",
                    }}
                  >
                    T
                  </div>
                )}
                <div
                  className="max-w-[80%] text-sm whitespace-pre-wrap"
                  style={{
                    padding: msg.role === "user" ? "10px 16px" : "14px 18px",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.role === "user" ? "var(--accent-bg)" : "var(--bg-primary)",
                    border: `1px solid ${msg.role === "user" ? "var(--accent-border)" : "var(--border-subtle)"}`,
                    color: msg.role === "user" ? "var(--clarify-user-color)" : "var(--clarify-ai-color)",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div
                  className="shrink-0 flex items-center justify-center font-semibold"
                  style={{
                    width: 24, height: 24, borderRadius: 6, marginRight: 10, marginTop: 2,
                    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
                    fontSize: 10, color: "var(--accent)", fontFamily: "var(--font-serif)",
                  }}
                >
                  T
                </div>
                <div
                  className="max-w-[80%] text-sm whitespace-pre-wrap"
                  style={{
                    padding: "14px 18px",
                    borderRadius: "14px 14px 14px 4px",
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--clarify-ai-color)",
                  }}
                >
                  {streamingText}
                  <span
                    className="inline-block w-1.5 h-4 ml-0.5 animate-pulse"
                    style={{ background: "var(--accent)" }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input + Confirm */}
          <div className="flex gap-2" style={{ padding: "12px 16px" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Reply..."
              className="flex-1 text-sm outline-none transition-all duration-300"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="text-sm disabled:opacity-30 cursor-pointer transition-all duration-300"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 16px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              Send
            </button>
            <button
              onClick={handleConfirm}
              disabled={sending}
              className="text-sm font-semibold disabled:opacity-30 cursor-pointer transition-all duration-300"
              style={{
                background: "var(--confirm-bg)",
                border: `1px solid var(--confirm-border)`,
                borderRadius: 10,
                padding: "10px 20px",
                color: "var(--success)",
                fontSize: 12,
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Spec display */}
      {status.spec && status.phase !== "clarifying" && (
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div
            className="text-[10px] font-semibold uppercase mb-2"
            style={{ color: "var(--text-muted)", letterSpacing: "0.14em", fontFamily: "var(--font-mono)" }}
          >
            Spec
          </div>
          <div
            className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed"
            style={{ color: "var(--clarify-ai-color)" }}
          >
            {status.spec}
          </div>
        </div>
      )}

      {/* Agent workflows + status */}
      <div className="space-y-3" style={{ padding: "16px 24px" }}>
        {status.agent_a?.workflow?.stages && status.agent_a.workflow.stages.length > 0 && (
          <AgentWorkflow label="Agent A" workflow={status.agent_a.workflow} />
        )}
        {status.agent_b?.workflow?.stages && status.agent_b.workflow.stages.length > 0 && (
          <AgentWorkflow label="Agent B" workflow={status.agent_b.workflow} />
        )}

        {/* PR links */}
        {(status.test_pr_url || status.feat_pr_url) && (
          <div className="flex gap-4 mt-2">
            {status.test_pr_url && (
              <a
                href={status.test_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: "var(--accent)" }}
              >
                Test PR
              </a>
            )}
            {status.feat_pr_url && (
              <a
                href={status.feat_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
                style={{ color: "var(--accent)" }}
              >
                Feature PR
              </a>
            )}
          </div>
        )}

        {/* Status indicators */}
        {status.phase === "waiting_merge" && (
          <StatusIndicator color="var(--warning)" text="Waiting for test PR to merge..." />
        )}
        {status.phase === "waiting_ci" && (
          <StatusIndicator color="var(--warning)" text="Waiting for CI to pass..." />
        )}
        {status.phase === "fixing" && (
          <StatusIndicator color="var(--error)" text="CI failed — Agent A is fixing..." />
        )}
        {status.phase === "merging" && (
          <StatusIndicator color="var(--accent)" text="Merging PR and creating release tag..." />
        )}
        {status.phase === "done" && (
          <div
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: "var(--success)" }}
          >
            Complete
          </div>
        )}
        {status.error && (
          <div className="text-xs" style={{ color: "var(--error)" }}>
            Error: {status.error}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusIndicator({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
      {text}
    </div>
  );
}

function PhaseStep({ label, state }: { label: string; state: "completed" | "active" | "pending" }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] whitespace-nowrap shrink-0"
      style={{
        padding: "6px 13px",
        borderRadius: 7,
        fontFamily: "var(--font-mono)",
        background:
          state === "active"
            ? "var(--stage-active-bg)"
            : state === "completed"
              ? "var(--stage-done-bg)"
              : "transparent",
        color:
          state === "active"
            ? "var(--accent)"
            : state === "completed"
              ? "var(--stage-done-color)"
              : "var(--text-muted)",
        border: state === "active" ? "1px solid var(--accent-border)" : "1px solid transparent",
        opacity: state === "pending" ? 0.4 : 1,
      }}
    >
      {state === "active" && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--accent)" }} />
      )}
      {state === "completed" && (
        <span className="text-[7px] opacity-60">{"\u2713"}</span>
      )}
      {label}
    </span>
  );
}

function PhaseArrow() {
  return (
    <svg width="18" height="8" viewBox="0 0 18 8" className="shrink-0" style={{ margin: "0 1px" }}>
      <line x1="2" y1="4" x2="13" y2="4" stroke="var(--stage-arrow-line)" strokeWidth="0.8" />
      <polygon points="12,2.5 15,4 12,5.5" fill="var(--stage-arrow-head)" />
    </svg>
  );
}

function formatElapsed(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function AgentWorkflow({ label, workflow }: { label: string; workflow: { stages: WorkflowStage[] } }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs font-medium shrink-0 w-16"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {workflow.stages.map((stage, i) => (
          <Fragment key={i}>
            {i > 0 && <PhaseArrow />}
            <span
              className="inline-flex items-center gap-1.5 text-[10px] whitespace-nowrap shrink-0"
              style={{
                padding: "6px 13px",
                borderRadius: 7,
                fontFamily: "var(--font-mono)",
                background: stage.status === "active" ? "var(--stage-active-bg)" : "transparent",
                color: stage.status === "active" ? "var(--accent)" : "var(--stage-pending-color)",
                border: stage.status === "active" ? "1px solid var(--accent-border)" : "1px solid transparent",
              }}
            >
              {stage.status === "active" && (
                <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--accent)" }} />
              )}
              {stage.name}
              {stage.count && stage.count > 1 && (
                <span style={{ opacity: 0.6 }}>&times;{stage.count}</span>
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
