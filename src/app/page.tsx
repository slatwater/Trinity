"use client";

import { useState, useEffect, useCallback } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { WorkflowMonitor } from "@/components/WorkflowMonitor";
import { Project } from "@/lib/types";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statuses, setStatuses] = useState<Record<string, "busy" | "idle">>({});

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
      p.language?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b px-8 py-5" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Trinity
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              {workspace}
            </p>
          </div>
          <input
            type="text"
            placeholder="Filter projects..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 rounded-lg text-sm outline-none w-64"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
        </div>
      </header>

      {/* Project Grid */}
      <main className="max-w-6xl mx-auto px-8 py-8">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                status={statuses[project.id] || "idle"}
                onClick={() => {
                  window.location.href = `/project/${project.id}`;
                }}
              />
            ))}
          </div>
        )}

        <WorkflowMonitor projects={projects} />
      </main>
    </div>
  );
}
