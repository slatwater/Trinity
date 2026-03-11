"use client";

import { useState } from "react";
import { Project } from "@/lib/types";

export function ProjectCard({
  project,
  status = "idle",
  accentColor = "#d4a574",
  index = 0,
  onClick,
  onClaudeMdClick,
}: {
  project: Project;
  status?: "busy" | "idle";
  accentColor?: string;
  index?: number;
  onClick: () => void;
  onClaudeMdClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const timeAgo = getTimeAgo(project.lastModified);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer relative overflow-hidden flex flex-col justify-between"
      style={{
        background: hovered ? "var(--card-hover-bg)" : "var(--bg-secondary)",
        borderRadius: 16,
        padding: "28px 30px",
        transition: "all 0.55s cubic-bezier(0.16,1,0.3,1)",
        border: `1px solid ${hovered ? "var(--border-hover)" : "var(--border-subtle)"}`,
        boxShadow: hovered ? "var(--card-hover-shadow)" : "var(--card-shadow)",
        animation: `fadeUp 0.6s ${index * 0.08}s both`,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          position: "absolute", top: 0, left: 0,
          width: hovered ? 3 : 2,
          height: hovered ? "100%" : 40,
          background: `linear-gradient(180deg, ${accentColor}, transparent)`,
          borderRadius: "0 2px 2px 0",
          transition: "all 0.7s cubic-bezier(0.16,1,0.3,1)",
          opacity: hovered ? 1 : "var(--accent-bar-idle-opacity)",
        }}
      />

      {/* Hover glow */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -40, right: -40, width: 200, height: 200,
          background: `radial-gradient(circle, ${accentColor}${hovered ? "0a" : "00"} 0%, transparent 70%)`,
          transition: "all 0.6s",
        }}
      />

      {/* Top section */}
      <div className="relative z-[1]">
        <div className="flex justify-between items-start">
          <div>
            <h3
              className="m-0 mb-1 text-xl font-normal transition-colors duration-300"
              style={{
                color: hovered ? "var(--text-card-title-hover)" : "var(--text-card-title)",
                letterSpacing: "-0.02em",
                fontFamily: "var(--font-serif)",
              }}
            >
              {project.name}
            </h3>
            <div className="flex items-center gap-2">
              {project.version && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded font-semibold"
                  style={{
                    background: `${accentColor}12`,
                    color: accentColor,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {project.version}
                </span>
              )}
              {project.hasGit && (
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                >
                  main
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="relative rounded-full"
              style={{
                width: 24, height: 12,
                background: status === "busy" ? "rgba(34,197,94,0.15)" : "var(--toggle-idle-bg)",
                border: `1px solid ${status === "busy" ? "rgba(34,197,94,0.2)" : "var(--toggle-idle-border)"}`,
                transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <div
                className="absolute top-1/2 rounded-full"
                style={{
                  width: 6, height: 6,
                  background: status === "busy" ? "var(--success)" : "var(--toggle-idle-dot)",
                  transform: `translateY(-50%) translateX(${status === "busy" ? "15px" : "2px"})`,
                  transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
                  boxShadow: status === "busy" ? "0 0 6px rgba(34,197,94,0.4)" : "none",
                }}
              />
            </div>
            <span
              className="text-[9px] uppercase"
              style={{
                color: status === "busy" ? "rgba(34,197,94,0.7)" : "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                transition: "color 0.3s",
              }}
            >
              {status === "busy" ? "running" : "idle"}
            </span>
          </div>
        </div>

        {/* Version message */}
        {project.versionMessage && (
          <p
            className="mt-3.5 mb-0 text-[13px] leading-relaxed transition-colors duration-300"
            style={{
              color: hovered ? "var(--text-muted)" : "var(--text-faint)",
              maxWidth: 340,
            }}
          >
            {project.versionMessage}
          </p>
        )}
      </div>

      {/* Bottom section */}
      <div className="relative z-[1] flex items-center justify-between mt-4">
        <div className="flex gap-1.5 flex-wrap">
          {project.hasClaude && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClaudeMdClick?.();
              }}
              className="text-[10px] px-2.5 py-1 rounded-[5px] transition-all duration-300"
              style={{
                background: hovered ? "var(--purple-bg-hover)" : "var(--purple-bg)",
                color: hovered ? "var(--purple-color-hover)" : "var(--purple-color)",
                border: "1px solid var(--purple-border)",
                fontFamily: "var(--font-mono)",
              }}
            >
              CLAUDE.md
            </button>
          )}
          {project.configs.map((config) => (
            <span
              key={config.type}
              className="text-[10px] px-2.5 py-1 rounded-[5px] transition-all duration-300"
              title={config.items.join(", ")}
              style={{
                background: hovered ? "var(--badge-bg-hover)" : "var(--badge-bg)",
                color: hovered ? "var(--text-time-hover)" : "var(--text-dim)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {config.label} ({config.items.length})
            </span>
          ))}
        </div>
        <span
          className="text-[11px] transition-colors duration-300"
          style={{
            color: hovered ? "var(--text-time-hover)" : "var(--text-time)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {timeAgo}
        </span>
      </div>
    </div>
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
