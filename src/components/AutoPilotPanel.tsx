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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Poll status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot/${autopilotId}`);
      if (res.ok) setStatus(await res.json());
    } catch {
      /* ignore */
    }
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
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
              if (data.type === "done") {
                done = true;
                break;
              }
              if (data.type === "text" && data.content) {
                accumulated += data.content;
                setStreamingText(accumulated);
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch {
      /* disconnected */
    } finally {
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
        className="mt-8 rounded-lg border p-6"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
        }}
      >
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  // "fixing" maps to the same position as "waiting_ci" in the phase bar
  const displayPhase = status.phase === "fixing" ? "waiting_ci" : status.phase as AutoPilotPhase;
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === displayPhase);

  // Agent A messages — skip the first pair (system prompt + initial response)
  const clarifyMessages = (status.agent_a?.messages || []).slice(1);

  return (
    <section
      className="mt-8 rounded-lg border overflow-hidden"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2
            className="text-xs font-semibold tracking-wide uppercase shrink-0"
            style={{ color: "var(--accent)" }}
          >
            Auto Pilot
          </h2>
          <span
            className="text-xs truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {status.requirement}
          </span>
        </div>
        {status.phase !== "done" && (
          <button
            onClick={handleCancel}
            className="text-xs px-2 py-1 rounded shrink-0 ml-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Phase indicator bar */}
      <div
        className="px-5 py-3 flex items-center gap-1 border-b overflow-x-auto"
        style={{ borderColor: "var(--border)" }}
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
        <div
          className="border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="max-h-80 overflow-y-auto p-4 space-y-3">
            {clarifyMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap"
                  style={{
                    background:
                      msg.role === "user"
                        ? "var(--accent)"
                        : "var(--bg-tertiary)",
                    color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
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
          <div className="p-3 flex gap-2">
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
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              Send
            </button>
            <button
              onClick={handleConfirm}
              disabled={sending}
              className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
              style={{ background: "var(--success)", color: "#fff" }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Spec display (post-clarification phases) */}
      {status.spec && status.phase !== "clarifying" && (
        <div
          className="border-b p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="text-xs font-semibold mb-2 uppercase"
            style={{ color: "var(--text-secondary)" }}
          >
            Spec
          </div>
          <div
            className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto"
            style={{ color: "var(--text-primary)" }}
          >
            {status.spec}
          </div>
        </div>
      )}

      {/* Agent workflows + status */}
      <div className="p-4 space-y-3">
        {/* Agent A workflow */}
        {status.agent_a?.workflow?.stages &&
          status.agent_a.workflow.stages.length > 0 && (
            <AgentWorkflow label="Agent A" workflow={status.agent_a.workflow} />
          )}

        {/* Agent B workflow */}
        {status.agent_b?.workflow?.stages &&
          status.agent_b.workflow.stages.length > 0 && (
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

        {/* Waiting indicators */}
        {status.phase === "waiting_merge" && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--warning)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--warning)" }}
            />
            Waiting for test PR to merge...
          </div>
        )}
        {status.phase === "waiting_ci" && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--warning)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--warning)" }}
            />
            Waiting for CI to pass...
          </div>
        )}
        {status.phase === "fixing" && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--error)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--error)" }}
            />
            CI failed — Agent A is fixing...
          </div>
        )}
        {status.phase === "merging" && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--accent)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--accent)" }}
            />
            Merging PR and creating release tag...
          </div>
        )}

        {/* Done */}
        {status.phase === "done" && (
          <div
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: "var(--success)" }}
          >
            Complete
          </div>
        )}

        {/* Error */}
        {status.error && (
          <div className="text-xs" style={{ color: "var(--error)" }}>
            Error: {status.error}
          </div>
        )}
      </div>
    </section>
  );
}

// --- Sub-components ---

function PhaseStep({
  label,
  state,
}: {
  label: string;
  state: "completed" | "active" | "pending";
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap shrink-0"
      style={{
        background:
          state === "active"
            ? "rgba(99,102,241,0.12)"
            : state === "completed"
              ? "rgba(34,197,94,0.08)"
              : "var(--bg-primary)",
        color:
          state === "active"
            ? "var(--accent)"
            : state === "completed"
              ? "var(--success)"
              : "var(--text-secondary)",
        border:
          state === "active"
            ? "1px solid var(--accent)"
            : "1px solid transparent",
        opacity: state === "pending" ? 0.4 : 1,
      }}
    >
      {state === "active" && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{ background: "var(--accent)" }}
        />
      )}
      {label}
    </span>
  );
}

function PhaseArrow() {
  return (
    <svg
      width="16"
      height="10"
      viewBox="0 0 16 10"
      fill="none"
      className="shrink-0"
      style={{ color: "var(--border)" }}
    >
      <path
        d="M0 5h12m0 0L8.5 1.5M12 5L8.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AgentWorkflow({
  label,
  workflow,
}: {
  label: string;
  workflow: { stages: WorkflowStage[] };
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs font-medium shrink-0 w-16"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1 overflow-x-auto">
        {workflow.stages.map((stage, i) => (
          <Fragment key={i}>
            {i > 0 && <PhaseArrow />}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap shrink-0"
              style={{
                background:
                  stage.status === "active"
                    ? "rgba(99,102,241,0.12)"
                    : "var(--bg-primary)",
                color:
                  stage.status === "active"
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                border:
                  stage.status === "active"
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
              }}
            >
              {stage.status === "active" && (
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                  style={{ background: "var(--accent)" }}
                />
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
