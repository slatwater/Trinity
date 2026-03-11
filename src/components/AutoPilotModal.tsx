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

  const ready = projectId && requirement.trim();

  const handleSubmit = async () => {
    const project = projects.find((p) => p.id === projectId);
    if (!project || !requirement.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, projectPath: project.path, requirement: requirement.trim() }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: "backdropIn 0.3s both" }}>
      <div className="absolute inset-0" onClick={onClose} style={{ background: "var(--overlay-bg)", backdropFilter: "var(--overlay-blur)" }} />
      <div
        className="relative"
        style={{
          width: 460, background: "var(--modal-bg)", border: "1px solid var(--border)",
          borderRadius: 20, padding: "40px 36px 32px",
          boxShadow: "var(--modal-shadow)",
          animation: "modalIn 0.45s 0.1s both cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div className="absolute top-0" style={{ left: 32, right: 32, height: 1, background: `linear-gradient(90deg, transparent, var(--modal-accent-line), transparent)` }} />

        <h2 className="text-2xl font-light m-0 mb-8" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em", fontFamily: "var(--font-serif)" }}>
          Auto Pilot
        </h2>

        <div className="mb-5">
          <label className="block text-[10px] font-semibold uppercase mb-2" style={{ color: "var(--text-muted)", letterSpacing: "0.14em", fontFamily: "var(--font-mono)" }}>Project</label>
          <div className="relative">
            <select
              value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full cursor-pointer outline-none appearance-none transition-all duration-300"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px", color: projectId ? "var(--text-primary)" : "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--text-dim)")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            >
              <option value="" disabled>Select project...</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" className="pointer-events-none absolute" style={{ right: 14, top: "50%", transform: "translateY(-50%)" }}><path d="m6 9 6 6 6-6" /></svg>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-[10px] font-semibold uppercase mb-2" style={{ color: "var(--text-muted)", letterSpacing: "0.14em", fontFamily: "var(--font-mono)" }}>Requirement</label>
          <textarea
            value={requirement} onChange={(e) => setRequirement(e.target.value)}
            placeholder="Describe the feature you want..." rows={4}
            className="w-full outline-none resize-y transition-all duration-300"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-sans)", lineHeight: 1.6 }}
            onFocus={(e) => (e.target.style.borderColor = "var(--text-dim)")} onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer transition-all duration-300" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 22px", color: "var(--text-muted)", fontSize: 13 }}>Cancel</button>
          <button
            onClick={handleSubmit} disabled={loading || !ready}
            className="cursor-pointer font-bold transition-all duration-300"
            style={{
              background: ready ? "linear-gradient(135deg, var(--accent), var(--accent-hover))" : "var(--border)",
              color: ready ? "var(--accent-text-on)" : "var(--text-muted)",
              border: "none", borderRadius: 10, padding: "10px 28px", fontSize: 13,
              boxShadow: ready ? "var(--accent-shadow)" : "none",
              cursor: ready ? "pointer" : "default",
            }}
          >{loading ? "Starting..." : "Start"}</button>
        </div>
      </div>
    </div>
  );
}
