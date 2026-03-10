"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatWindow } from "@/components/ChatWindow";
import { Project } from "@/lib/types";
import { useChatStore } from "@/stores/chat";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [processAlive, setProcessAlive] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.projects || []).find((p: Project) => p.id === projectId);
        setProject(found || null);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Poll process status
  useEffect(() => {
    if (!projectId) return;
    const check = () => {
      fetch(`/api/session?id=${encodeURIComponent(projectId)}`)
        .then((r) => r.json())
        .then((d) => setProcessAlive(d.alive))
        .catch(() => setProcessAlive(false));
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
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
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
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
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: processAlive ? "#22c55e" : "var(--border)" }}
              title={processAlive ? "Process running" : "No active process"}
            />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {project.name}
              </h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {project.path}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {project.language && (
            <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
              {project.language}
            </span>
          )}
          <button
            onClick={async () => {
              await fetch("/api/session", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: project.id }),
              });
              useChatStore.getState().clearSession(project.id);
            }}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            New Chat
          </button>
        </div>
      </header>

      {/* Chat */}
      <ChatWindow project={project} />
    </div>
  );
}
