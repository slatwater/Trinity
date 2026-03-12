"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfigEditor } from "@/components/ConfigEditor";

// --- Types (mirrors API) ---

interface ConfigNode {
  name: string;
  path: string;
  kind: "file" | "dir" | "hooks" | "cli-tools" | "mcp-servers";
  exists: boolean;
  lines?: number;
  children?: ConfigNode[];
  count?: number;
  settingsPath?: string;
  tools?: { name: string; version: string; binPath: string }[];
  servers?: { name: string; command: string; args?: string[] }[];
}

interface SectionData {
  basePath: string;
  displayPath: string;
  nodes: ConfigNode[];
}

interface ProjectItem {
  name: string;
  path: string;
}

type EditState = {
  path: string;
  displayName: string;
  content: string;
  mode: "file" | "hooks";
} | null;

// --- Tree flattening ---

interface FlatRow {
  node: ConfigNode;
  prefix: string;
}

function flattenTree(nodes: ConfigNode[], parentIsLast: boolean[] = []): FlatRow[] {
  const rows: FlatRow[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const prefix =
      parentIsLast.map((l) => (l ? "    " : "\u2502   ")).join("") +
      (isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ");
    rows.push({ node, prefix });
    if (node.kind === "dir" && node.children && node.children.length > 0) {
      rows.push(...flattenTree(node.children, [...parentIsLast, isLast]));
    }
  });
  return rows;
}

// --- Page ---

export default function ConfigPage() {
  const [globalData, setGlobalData] = useState<SectionData | null>(null);
  const [projectData, setProjectData] = useState<SectionData | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [editing, setEditing] = useState<EditState>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(
    (projPath?: string) => {
      const qs = projPath ? `?project=${encodeURIComponent(projPath)}` : "";
      fetch(`/api/config${qs}`)
        .then((r) => r.json())
        .then((data) => {
          setGlobalData(data.global);
          if (data.project) setProjectData(data.project);
          if (data.projects) setProjects(data.projects);
          if (!projPath && data.projects?.length > 0) {
            setSelectedProject(data.projects[0].path);
          }
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load project config when selection changes
  useEffect(() => {
    if (!selectedProject) return;
    fetch(`/api/config?project=${encodeURIComponent(selectedProject)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProjectData(data.project);
      });
  }, [selectedProject]);

  const refresh = () => loadConfig(selectedProject);

  // --- Edit handlers ---

  const openFileEditor = async (filePath: string, displayName: string) => {
    const res = await fetch(`/api/config?file=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    setEditing({ path: filePath, displayName, content: data.content || "", mode: "file" });
  };

  const openHooksEditor = async (settingsPath: string) => {
    const res = await fetch(`/api/config?file=${encodeURIComponent(settingsPath)}`);
    const data = await res.json();
    let hooksJson = "{}";
    try {
      const settings = JSON.parse(data.content || "{}");
      hooksJson = JSON.stringify(settings.hooks || {}, null, 2);
    } catch {}
    setEditing({ path: settingsPath, displayName: "hooks", content: hooksJson, mode: "hooks" });
  };

  const handleSave = async (newContent: string) => {
    if (!editing) return;

    if (editing.mode === "hooks") {
      // Merge hooks back into settings.json
      const res = await fetch(`/api/config?file=${encodeURIComponent(editing.path)}`);
      const data = await res.json();
      const settings = JSON.parse(data.content || "{}");
      const parsed = JSON.parse(newContent);
      if (Object.keys(parsed).length === 0) {
        delete settings.hooks;
      } else {
        settings.hooks = parsed;
      }
      const saveRes = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: editing.path, content: JSON.stringify(settings, null, 2) + "\n" }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error);
    } else {
      const saveRes = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: editing.path, content: newContent }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error);
    }

    setEditing(null);
    refresh();
  };

  const handleCreate = async (filePath: string, isDirectory: boolean) => {
    if (!isDirectory) {
      // For files: create with template based on extension
      const template = filePath.endsWith(".json") ? "{}\n" : "";
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, template }),
      });
      refresh();
      // Open editor for the new file
      setTimeout(() => openFileEditor(filePath, filePath.split("/").pop() || ""), 200);
    } else {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, isDirectory: true }),
      });
      refresh();
    }
  };

  const handleAddFileToDir = async (dirPath: string) => {
    const name = window.prompt("File name:", "new-file.md");
    if (!name) return;
    const filePath = `${dirPath}/${name}`;
    await handleCreate(filePath, false);
  };

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // --- Row rendering ---

  const renderRow = (row: FlatRow, idx: number) => {
    const { node, prefix } = row;

    // File node
    if (node.kind === "file") {
      return (
        <div key={`${node.path}-${idx}`} className="flex items-center group" style={{ height: 32 }}>
          <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>{prefix}</span>
          <span
            className="cursor-pointer transition-colors duration-150"
            style={{ color: node.exists ? "var(--text-primary)" : "var(--text-dim)" }}
            onClick={() => node.exists && openFileEditor(node.path, node.name)}
            onMouseEnter={(e) => node.exists && (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => node.exists && (e.currentTarget.style.color = "var(--text-primary)")}
          >
            {node.name}
          </span>
          <span className="flex-1" />
          {node.exists ? (
            <>
              <span className="mr-3" style={{ color: "var(--text-dim)", fontSize: 11 }}>
                {node.lines} lines
              </span>
              <button
                onClick={() => openFileEditor(node.path, node.name)}
                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13 }}
              >
                {"\u270E"}
              </button>
            </>
          ) : (
            <button
              onClick={() => handleCreate(node.path, false)}
              className="text-[10px] cursor-pointer transition-colors duration-150"
              style={{
                background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: 4,
                padding: "1px 8px",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {"\u521B\u5EFA"}
            </button>
          )}
        </div>
      );
    }

    // Directory node
    if (node.kind === "dir") {
      const isEmpty = !node.children || node.children.length === 0;
      return (
        <div key={`${node.path}-${idx}`} className="flex items-center group" style={{ height: 32 }}>
          <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>{prefix}</span>
          <span style={{ color: "var(--accent)" }}>{node.name}</span>
          <span className="flex-1" />
          {isEmpty && (
            <span className="mr-3 italic" style={{ color: "var(--text-dim)", fontSize: 11 }}>
              (none)
            </span>
          )}
          {node.exists ? (
            <button
              onClick={() => handleAddFileToDir(node.path)}
              className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px]"
              style={{
                background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: 4,
                padding: "1px 8px",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              +
            </button>
          ) : (
            <button
              onClick={() => handleCreate(node.path, true)}
              className="text-[10px] cursor-pointer transition-colors duration-150"
              style={{
                background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: 4,
                padding: "1px 8px",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {"\u521B\u5EFA"}
            </button>
          )}
        </div>
      );
    }

    // Hooks (virtual)
    if (node.kind === "hooks") {
      return (
        <div key={`hooks-${node.settingsPath}-${idx}`} className="flex items-center group" style={{ height: 32 }}>
          <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>{prefix}</span>
          <span
            className="cursor-pointer transition-colors duration-150"
            style={{ color: "var(--text-primary)" }}
            onClick={() => node.settingsPath && openHooksEditor(node.settingsPath)}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          >
            hooks
          </span>
          <span className="flex-1" />
          <span className="mr-3" style={{ color: "var(--text-dim)", fontSize: 11, fontStyle: node.count === 0 ? "italic" : "normal" }}>
            {node.count === 0 ? "(none)" : `${node.count} hooks`}
          </span>
          <button
            onClick={() => node.settingsPath && openHooksEditor(node.settingsPath)}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13 }}
          >
            {"\u270E"}
          </button>
        </div>
      );
    }

    // CLI Tools (collapsible)
    if (node.kind === "cli-tools") {
      const isExpanded = expanded["cli-tools"];
      return (
        <div key={`cli-${idx}`}>
          <div
            className="flex items-center cursor-pointer group"
            style={{ height: 32 }}
            onClick={() => toggle("cli-tools")}
          >
            <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>{prefix}</span>
            <span style={{ color: "var(--text-primary)" }}>
              {isExpanded ? "\u25BE" : "\u25B8"} System Tools
            </span>
            <span className="flex-1" />
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{node.count} items</span>
          </div>
          {isExpanded &&
            node.tools?.map((t) => {
              // Compute continuation prefix: inherit from current row's tree position
              const contPrefix = prefix.replace(/[\u251C\u2514][\u2500\u2500] $/, "").replace(/[\u251C\u2514]\u2500\u2500 $/, "");
              const lastChar = prefix.includes("\u2514") ? "    " : "\u2502   ";
              return (
                <div
                  key={t.name}
                  className="flex items-center"
                  style={{ height: 26, paddingLeft: 0 }}
                >
                  <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>
                    {contPrefix}{lastChar}    </span>
                  <span style={{ color: "var(--text-secondary)", width: 100, display: "inline-block" }}>
                    {t.name}
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    {t.version || t.binPath}
                  </span>
                </div>
              );
            })}
        </div>
      );
    }

    // MCP Servers (collapsible)
    if (node.kind === "mcp-servers") {
      const isExpanded = expanded["mcp-servers"];
      const hasMcp = node.count !== undefined && node.count > 0;
      return (
        <div key={`mcp-${idx}`}>
          <div
            className={`flex items-center ${hasMcp ? "cursor-pointer" : ""} group`}
            style={{ height: 32 }}
            onClick={() => hasMcp && toggle("mcp-servers")}
          >
            <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>{prefix}</span>
            <span style={{ color: "var(--text-primary)" }}>
              {hasMcp ? (isExpanded ? "\u25BE" : "\u25B8") : ""} MCP Servers
            </span>
            <span className="flex-1" />
            <span className="italic" style={{ color: "var(--text-dim)", fontSize: 11, fontStyle: hasMcp ? "normal" : "italic" }}>
              {hasMcp ? `${node.count} servers` : "(none)"}
            </span>
          </div>
          {isExpanded &&
            node.servers?.map((s) => {
              const contPrefix = prefix.replace(/[\u251C\u2514][\u2500\u2500] $/, "").replace(/[\u251C\u2514]\u2500\u2500 $/, "");
              const lastChar = prefix.includes("\u2514") ? "    " : "\u2502   ";
              return (
                <div key={s.name} className="flex items-center" style={{ height: 26 }}>
                  <span style={{ color: "var(--text-dim)", whiteSpace: "pre" }}>
                    {contPrefix}{lastChar}    </span>
                  <span style={{ color: "var(--text-secondary)", width: 120, display: "inline-block" }}>
                    {s.name}
                  </span>
                  <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                    {s.command} {s.args?.join(" ")}
                  </span>
                </div>
              );
            })}
        </div>
      );
    }

    return null;
  };

  // --- Section rendering ---

  const renderSection = (data: SectionData) => {
    const rows = flattenTree(data.nodes);
    return (
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: "1",
        }}
      >
        {/* Base path */}
        <div className="mb-1" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          {data.displayPath}
        </div>
        {rows.map((row, i) => renderRow(row, i))}
      </div>
    );
  };

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
        className="relative z-[1] mx-auto"
        style={{ maxWidth: 1060, animation: "fadeUp 0.6s both" }}
      >
        {/* Header */}
        <div className="drag" style={{ padding: "52px 0 0" }}>
          <div className="no-drag">
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
                Settings
              </div>
            </div>
            <h1
              className="text-[52px] font-light m-0 leading-none"
              style={{
                color: "var(--text-primary)",
                letterSpacing: "-0.04em",
                fontFamily: "var(--font-serif)",
              }}
            >
              Config
            </h1>
          </div>

          {/* Divider */}
          <div className="relative" style={{ marginTop: 32, height: 1 }}>
            <div
              className="absolute left-0 top-0 h-px"
              style={{
                background: "linear-gradient(90deg, var(--accent), var(--accent-border) 40%, var(--divider-end) 70%)",
                animation: "lineGrow 1.2s cubic-bezier(0.16,1,0.3,1) both",
              }}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Scanning configuration...
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 40 }}>
            {/* === Global Section === */}
            <div
              className="rounded-2xl"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                padding: "24px 28px",
                marginBottom: 24,
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <h2
                  className="text-lg font-normal m-0"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
                >
                  Global
                </h2>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                >
                  ~/.claude/
                </span>
              </div>
              {globalData && renderSection(globalData)}
            </div>

            {/* === Project Section === */}
            <div
              className="rounded-2xl"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                padding: "24px 28px",
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <h2
                  className="text-lg font-normal m-0"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
                >
                  Project
                </h2>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="text-[11px] cursor-pointer outline-none"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    appearance: "none",
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%237a7874' stroke-width='1.2'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                    paddingRight: 24,
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {projectData && renderSection(projectData)}
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editing && (
        <ConfigEditor
          filePath={editing.path}
          displayName={editing.displayName}
          initialContent={editing.content}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
