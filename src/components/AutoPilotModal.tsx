"use client";

import { useState } from "react";
import { Project } from "@/lib/types";

interface Props {
  projects: Project[];
  onClose: () => void;
  onStart: (id: string) => void;
}

export function AutoPilotModal({ projects, onClose, onStart }: Props) {
  const [projectId, setProjectId] = useState("");
  const [requirement, setRequirement] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const project = projects.find((p) => p.id === projectId);
    if (!project || !requirement.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          projectPath: project.path,
          requirement: requirement.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onStart(data.id);
    } catch {
      alert("Failed to start Auto Pilot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl p-6"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-lg font-bold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          Auto Pilot
        </h2>

        <label
          className="block text-xs mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Project
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm mb-4 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <option value="">Select project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label
          className="block text-xs mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Requirement
        </label>
        <textarea
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="Describe the feature you want..."
          rows={4}
          className="w-full resize-none rounded-lg px-3 py-2 text-sm mb-4 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !projectId || !requirement.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-30"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Starting..." : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
