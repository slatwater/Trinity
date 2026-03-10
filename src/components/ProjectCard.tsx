"use client";

import { Project } from "@/lib/types";

const langColors: Record<string, string> = {
  "JavaScript/TypeScript": "#f7df1e",
  Rust: "#dea584",
  Go: "#00add8",
  Python: "#3776ab",
  Elixir: "#6e4a7e",
  Ruby: "#cc342d",
  "Java": "#ed8b00",
  "Java/Kotlin": "#ed8b00",
  "C/C++": "#00599c",
  "Dart/Flutter": "#0175c2",
};

export function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const timeAgo = getTimeAgo(project.lastModified);

  return (
    <button
      onClick={onClick}
      className="group w-full text-left p-5 rounded-lg border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.background = "var(--bg-tertiary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-secondary)";
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {project.name}
        </h3>
        <div className="flex gap-1.5">
          {project.hasGit && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}>
              git
            </span>
          )}
          {project.hasClaude && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>
              claude
            </span>
          )}
        </div>
      </div>

      {project.description && (
        <p className="text-sm mb-3 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
          {project.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        {project.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: langColors[project.language] || "#888" }}
            />
            {project.language}
          </span>
        )}
        <span>{timeAgo}</span>
      </div>
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
