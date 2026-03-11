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
    <div className="flex flex-col h-screen" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Top Bar — left zone reserved for traffic lights */}
      <header
        className="flex items-center justify-between shrink-0 drag"
        style={{
          padding: "16px 32px 16px 88px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-4 no-drag">
          <div className="flex items-center gap-2.5">
            <div
              className="rounded-full shrink-0"
              style={{
                width: 6, height: 6,
                background: processAlive ? "var(--success)" : "var(--border)",
              }}
            />
            <span
              className="text-[17px] font-normal"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
            >
              {project.name}
            </span>
            {project.version && (
              <span
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  background: "var(--accent-bg)",
                  border: "1px solid var(--accent-border)",
                }}
              >
                {project.version}
              </span>
            )}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)" }} />

          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 cursor-pointer transition-colors duration-300"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <span style={{ fontSize: 16 }}>&larr;</span> Back
          </button>
        </div>

        <button
          onClick={async () => {
            await fetch("/api/session", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: project.id }),
            });
            useChatStore.getState().clearSession(project.id);
          }}
          className="cursor-pointer transition-all duration-300 no-drag"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "7px 18px",
            color: "var(--text-secondary)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          New Chat
        </button>
      </header>

      {/* Chat */}
      <ChatWindow project={project} />
    </div>
  );
}
