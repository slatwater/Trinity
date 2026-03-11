"use client";

import { useEffect } from "react";
import { Project } from "@/lib/types";

export function ClaudeMdModal({ project, onClose }: { project: Project; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "backdropIn 0.3s both" }}>
      <div className="absolute inset-0" onClick={onClose} style={{ background: "var(--overlay-bg)", backdropFilter: "var(--overlay-blur)" }} />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        style={{ background: "var(--modal-bg)", border: "1px solid var(--border)", borderRadius: 20, boxShadow: "var(--modal-shadow)", animation: "modalIn 0.45s 0.1s both cubic-bezier(0.16,1,0.3,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0" style={{ left: 32, right: 32, height: 1, background: `linear-gradient(90deg, transparent, var(--modal-purple-line), transparent)` }} />

        <div className="flex items-center justify-between shrink-0" style={{ padding: "20px 28px", borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-base font-normal" style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}>
            {project.name}
            <span className="ml-2 text-xs" style={{ color: "var(--purple-color)", fontFamily: "var(--font-mono)" }}>CLAUDE.md</span>
          </h3>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded-md transition-opacity hover:opacity-70" style={{ color: "var(--text-muted)", background: "var(--bg-tertiary)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>ESC</button>
        </div>

        <pre className="overflow-auto flex-1 text-sm leading-relaxed whitespace-pre-wrap" style={{ padding: "24px 28px", color: "var(--ai-bubble-color)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {project.claudeMdContent || "Empty file"}
        </pre>
      </div>
    </div>
  );
}
