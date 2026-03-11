"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Project, ProjectWorkflow, WorkflowStage } from "@/lib/types";

export function WorkflowMonitor({
  projects,
  statuses = {},
}: {
  projects: Project[];
  statuses?: Record<string, "busy" | "idle">;
}) {
  const [workflows, setWorkflows] = useState<ProjectWorkflow[]>([]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const workflowMap = Object.fromEntries(workflows.map((w) => [w.project_id, w]));

  // Merge: show projects that have workflow stages OR are busy in card status
  const visibleIds = new Set<string>();
  for (const w of workflows) {
    if (w.stages.length > 0) visibleIds.add(w.project_id);
  }
  for (const [id, s] of Object.entries(statuses)) {
    if (s === "busy") visibleIds.add(id);
  }

  if (visibleIds.size === 0) return null;

  const visibleList = Array.from(visibleIds);

  return (
    <div style={{ animation: "fadeUp 0.6s 0.4s both" }}>
      {/* Section header */}
      <div className="flex items-center gap-3.5 mb-4">
        <span
          className="text-[9px] font-semibold uppercase"
          style={{
            color: "var(--text-dim)",
            letterSpacing: "0.18em",
            fontFamily: "var(--font-mono)",
          }}
        >
          Activity
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
        <span
          className="text-[9px]"
          style={{ color: "var(--text-time)", fontFamily: "var(--font-mono)" }}
        >
          Live
        </span>
      </div>

      {/* Activity rows */}
      {visibleList.map((id) => {
        const workflow = workflowMap[id];
        const name = projectMap[id]?.name || "Unknown";
        const isBusy = statuses[id] === "busy" || workflow?.status === "busy";

        return (
          <WorkflowRow
            key={id}
            workflow={workflow}
            projectName={name}
            isBusy={isBusy}
          />
        );
      })}
    </div>
  );
}

function WorkflowRow({
  workflow,
  projectName,
  isBusy,
}: {
  workflow?: ProjectWorkflow;
  projectName: string;
  isBusy: boolean;
}) {
  const stages = workflow?.stages || [];

  return (
    <div
      className="flex items-center gap-3.5 relative mb-2"
      style={{
        padding: "20px 26px",
        background: "var(--bg-secondary)",
        borderRadius: 14,
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Scanline effect */}
      {isBusy && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(90deg, transparent, var(--scanline-color) 50%, transparent)`,
              animation: "scanline 10s linear infinite",
            }}
          />
        </div>
      )}

      {/* Project avatar */}
      <div
        className="shrink-0 flex items-center justify-center font-semibold"
        style={{
          width: 32, height: 32, borderRadius: 9,
          background: isBusy ? "var(--avatar-bg)" : "var(--avatar-bg-idle)",
          border: `1px solid ${isBusy ? "var(--avatar-border)" : "var(--avatar-border-idle)"}`,
          fontSize: 13,
          color: isBusy ? "var(--avatar-color)" : "var(--text-dim)",
          fontFamily: "var(--font-serif)",
          transition: "all 0.3s",
        }}
      >
        {projectName.charAt(0).toUpperCase()}
      </div>

      <span
        className="text-[13px] font-medium shrink-0"
        style={{ color: "var(--text-secondary)", minWidth: 110 }}
      >
        {projectName}
      </span>

      <div
        className="shrink-0"
        style={{ height: 1, width: 24, background: `linear-gradient(90deg, var(--divider-end), transparent)` }}
      />

      {stages.length > 0 ? (
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {stages.map((stage, i) => (
            <Fragment key={i}>
              {i > 0 && <StageArrow />}
              <StageNode stage={stage} />
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="text-[10px]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Starting...
          </span>
        </div>
      )}
    </div>
  );
}

function StageNode({ stage }: { stage: WorkflowStage }) {
  const isActive = stage.status === "active";
  const isDone = stage.name === "Done";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] shrink-0 whitespace-nowrap"
      style={{
        padding: "6px 13px",
        borderRadius: 7,
        background: isDone
          ? "var(--stage-done-bg)"
          : isActive
            ? "var(--stage-active-bg)"
            : "transparent",
        color: isDone
          ? "var(--stage-done-color)"
          : isActive
            ? "var(--accent)"
            : "var(--stage-pending-color)",
        fontFamily: "var(--font-mono)",
        border: isDone ? `1px solid var(--stage-done-border)` : "1px solid transparent",
      }}
    >
      <span className="text-[7px] opacity-50">
        {isDone ? "\u2713" : isActive ? "\u25C9" : "\u25CE"}
      </span>
      {stage.name}
      {stage.count && stage.count > 1 && (
        <span style={{ opacity: 0.6 }}>&times;{stage.count}</span>
      )}
    </span>
  );
}

function StageArrow() {
  return (
    <svg width="18" height="8" viewBox="0 0 18 8" className="shrink-0" style={{ margin: "0 1px" }}>
      <line x1="2" y1="4" x2="13" y2="4" stroke="var(--stage-arrow-line)" strokeWidth="0.8" />
      <polygon points="12,2.5 15,4 12,5.5" fill="var(--stage-arrow-head)" />
    </svg>
  );
}
