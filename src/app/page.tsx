"use client";

import { useState, useEffect, useCallback } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { ClaudeMdModal } from "@/components/ClaudeMdModal";
import { WorkflowMonitor } from "@/components/WorkflowMonitor";
import { AutoPilotModal } from "@/components/AutoPilotModal";
import { AutoPilotPanel } from "@/components/AutoPilotPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Project } from "@/lib/types";

const ACCENT_COLORS = ["#d4a574", "#7aacbf", "#a87abf", "#7abf8e"];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statuses, setStatuses] = useState<Record<string, "busy" | "idle">>({});
  const [showModal, setShowModal] = useState(false);
  const [autopilotId, setAutopilotId] = useState<string | null>(null);
  const [claudeMdProject, setClaudeMdProject] = useState<Project | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setWorkspace(data.workspace || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const pollStatuses = useCallback(async (projectList: Project[]) => {
    const entries = await Promise.all(
      projectList.map(async (p) => {
        try {
          const res = await fetch(`/api/messages?id=${p.id}`);
          if (!res.ok) return [p.id, "idle"] as const;
          const data = await res.json();
          return [p.id, data.status === "busy" ? "busy" : "idle"] as const;
        } catch {
          return [p.id, "idle"] as const;
        }
      })
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    pollStatuses(projects);
    const interval = setInterval(() => pollStatuses(projects), 5000);
    return () => clearInterval(interval);
  }, [projects, pollStatuses]);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.version?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen relative" style={{ padding: "0 48px 80px" }}>
      {/* Ambient glows */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -100, left: -80, width: 500, height: 500,
          background: "radial-gradient(circle, var(--ambient-warm) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: -100, right: -80, width: 400, height: 400,
          background: "radial-gradient(circle, var(--ambient-cool) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />

      <div
        className="relative z-[1] mx-auto"
        style={{ maxWidth: 1060, animation: "fadeUp 0.6s both" }}
      >
        {/* Header */}
        <div style={{ padding: "52px 0 0" }}>
          <div className="flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2.5 mb-3.5">
                <div
                  className="text-[10px] px-3 py-1 rounded-[5px] font-semibold uppercase tracking-wider"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--accent-bg)",
                    border: "1px solid var(--accent-border)",
                    color: "var(--accent)",
                    letterSpacing: "0.08em",
                  }}
                >
                  Workspace
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                >
                  {workspace}
                </span>
              </div>
              <h1
                className="text-[52px] font-light m-0 leading-none"
                style={{
                  color: "var(--text-primary)",
                  letterSpacing: "-0.04em",
                  fontFamily: "var(--font-serif)",
                }}
              >
                Trinity
              </h1>
            </div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <ThemeToggle />
              <button
                onClick={() => {
                  const el = document.getElementById("filter-input");
                  if (el) el.focus();
                }}
                className="flex items-center gap-2 cursor-pointer transition-all duration-300"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "11px 20px",
                  color: "var(--text-muted)",
                  fontSize: 12,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Filter
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="cursor-pointer font-bold transition-all duration-300"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                  color: "var(--accent-text-on)",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 28px",
                  fontSize: 12,
                  boxShadow: "var(--accent-shadow)",
                }}
              >
                Auto Pilot
              </button>
            </div>
          </div>

          {/* Filter input (hidden, revealed by focus) */}
          <input
            id="filter-input"
            type="text"
            placeholder="Search projects..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="outline-none transition-all duration-300 mt-4"
            style={{
              width: filter ? "100%" : 0,
              maxWidth: 300,
              opacity: filter ? 1 : 0,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: filter ? "8px 16px" : "0",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
            }}
            onFocus={(e) => {
              e.target.style.width = "100%";
              e.target.style.opacity = "1";
              e.target.style.padding = "8px 16px";
            }}
            onBlur={(e) => {
              if (!filter) {
                e.target.style.width = "0";
                e.target.style.opacity = "0";
                e.target.style.padding = "0";
              }
            }}
          />

          {/* Animated divider */}
          <div className="relative" style={{ marginTop: 32, height: 1 }}>
            <div
              className="absolute left-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, var(--accent), var(--accent-border) 40%, var(--divider-end) 70%)`,
                animation: "lineGrow 1.2s cubic-bezier(0.16,1,0.3,1) both",
              }}
            />
          </div>
        </div>

        {/* Bento Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Scanning workspace...
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center" style={{ color: "var(--text-secondary)" }}>
              <p className="text-sm">
                {filter ? "No matching projects" : "No projects found"}
              </p>
              <p className="text-xs mt-2 opacity-60">{workspace}</p>
            </div>
          </div>
        ) : (
          <div
            className="gap-2.5"
            style={{
              display: "grid",
              gridTemplateColumns: filtered.length === 1 ? "1fr" : "1.35fr 1fr",
              gridAutoRows: "minmax(210px, auto)",
              marginTop: 40,
              marginBottom: 48,
            }}
          >
            {filtered.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                status={statuses[project.id] || "idle"}
                accentColor={ACCENT_COLORS[i % ACCENT_COLORS.length]}
                index={i}
                onClick={() => {
                  window.location.href = `/project/${project.id}`;
                }}
                onClaudeMdClick={() => setClaudeMdProject(project)}
              />
            ))}
          </div>
        )}

        <WorkflowMonitor projects={projects} statuses={statuses} />

        {autopilotId && (
          <AutoPilotPanel
            autopilotId={autopilotId}
            onClose={() => setAutopilotId(null)}
          />
        )}
      </div>

      {claudeMdProject && (
        <ClaudeMdModal
          project={claudeMdProject}
          onClose={() => setClaudeMdProject(null)}
        />
      )}

      {showModal && (
        <AutoPilotModal
          projects={projects}
          onClose={() => setShowModal(false)}
          onStart={(id) => {
            setShowModal(false);
            setAutopilotId(id);
          }}
        />
      )}
    </div>
  );
}
