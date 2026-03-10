"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatWindow } from "@/components/ChatWindow";
import { TaskPanel } from "@/components/TaskPanel";
import { Project } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.projects || []).find((p: Project) => p.id === projectId);
        setProject(found || null);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Project not found</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-sm underline"
            style={{ color: "var(--accent)" }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header
          className="flex items-center justify-between px-6 py-3 border-b"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="text-sm hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              &larr; Back
            </button>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {project.name}
              </h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {project.path}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {project.language && (
              <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
                {project.language}
              </span>
            )}
            <button
              onClick={() => setShowTasks(!showTasks)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: showTasks ? "var(--accent)" : "var(--bg-primary)",
                color: showTasks ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              Tasks
            </button>
          </div>
        </header>

        {/* Chat */}
        <ChatWindow project={project} />
      </div>

      {/* Side Panel - Tasks */}
      {showTasks && (
        <aside
          className="w-80 border-l overflow-y-auto"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <TaskPanel />
        </aside>
      )}
    </div>
  );
}
