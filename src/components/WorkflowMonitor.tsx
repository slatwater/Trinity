"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Project, ProjectWorkflow, WorkflowStage } from "@/lib/types";

export function WorkflowMonitor({ projects }: { projects: Project[] }) {
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

  const activeWorkflows = workflows.filter(
    (w) => w.stages.length > 0
  );

  if (activeWorkflows.length === 0) return null;

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  return (
    <section
      className="mt-8 rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
    >
      <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
          Activity
        </h2>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {activeWorkflows.map((w) => (
          <WorkflowRow
            key={w.project_id}
            workflow={w}
            projectName={projectMap[w.project_id]?.name || "Unknown"}
          />
        ))}
      </div>
    </section>
  );
}

function WorkflowRow({
  workflow,
  projectName,
}: {
  workflow: ProjectWorkflow;
  projectName: string;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="flex items-center gap-2 shrink-0 w-36">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: workflow.status === "busy" ? "#22c55e" : "var(--text-secondary)",
          }}
        />
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {projectName}
        </span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
        {workflow.stages.map((stage, i) => (
          <Fragment key={i}>
            {i > 0 && <Arrow />}
            <StageNode stage={stage} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function StageNode({ stage }: { stage: WorkflowStage }) {
  const isActive = stage.status === "active";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap shrink-0"
      style={{
        background: isActive ? "rgba(99,102,241,0.12)" : "var(--bg-primary)",
        color: isActive ? "var(--accent)" : "var(--text-secondary)",
        border: isActive ? "1px solid var(--accent)" : "1px solid transparent",
      }}
    >
      {isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{ background: "var(--accent)" }}
        />
      )}
      {stage.name}
    </span>
  );
}

function Arrow() {
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
