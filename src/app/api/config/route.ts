import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, ".claude");
const PROJECTS_DIR = process.env.TRINITY_WORKSPACE || path.join(HOME, "Projects");

export interface ConfigNode {
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

function countLines(filePath: string): number {
  try {
    return fs.readFileSync(filePath, "utf-8").split("\n").length;
  } catch {
    return 0;
  }
}

function fileNode(name: string, filePath: string): ConfigNode {
  const exists = fs.existsSync(filePath);
  return { name, path: filePath, kind: "file", exists, lines: exists ? countLines(filePath) : undefined };
}

function dirNode(name: string, dirPath: string, exts = [".md", ".json"]): ConfigNode {
  const exists = fs.existsSync(dirPath);
  const children: ConfigNode[] = [];
  if (exists) {
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isFile() && exts.some((ext) => entry.name.endsWith(ext))) {
          children.push(fileNode(entry.name, path.join(dirPath, entry.name)));
        }
      }
    } catch {}
  }
  return { name: name + "/", path: dirPath, kind: "dir", exists, children };
}

function hooksNode(settingsPath: string): ConfigNode {
  let count = 0;
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    if (data.hooks) count = Object.keys(data.hooks).length;
  } catch {}
  return { name: "hooks", path: settingsPath, kind: "hooks", exists: true, count, settingsPath };
}

function detectCliTools(): ConfigNode {
  const names = ["claude", "node", "npm", "git", "elixir", "mix", "iex", "cargo", "rustc", "python3", "go", "docker", "gh"];
  const tools: ConfigNode["tools"] = [];
  for (const name of names) {
    try {
      const binPath = execSync(`command -v ${name} 2>/dev/null`, { encoding: "utf-8", timeout: 3000 }).trim();
      if (!binPath) continue;
      let version = "";
      try {
        const raw = execSync(`${name} --version 2>/dev/null`, { encoding: "utf-8", timeout: 5000 });
        version = raw.split("\n")[0].trim();
      } catch {}
      tools.push({ name, version, binPath });
    } catch {}
  }
  return { name: "System Tools", path: "", kind: "cli-tools", exists: true, count: tools.length, tools };
}

function mcpNode(...settingsPaths: (string | undefined)[]): ConfigNode {
  const servers: ConfigNode["servers"] = [];
  for (const p of settingsPaths.filter(Boolean) as string[]) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (data.mcpServers) {
        for (const [name, cfg] of Object.entries(data.mcpServers)) {
          const c = cfg as Record<string, unknown>;
          servers.push({ name, command: (c.command as string) || "", args: (c.args as string[]) || [] });
        }
      }
    } catch {}
  }
  return { name: "MCP Servers", path: settingsPaths[0] || "", kind: "mcp-servers", exists: true, count: servers.length, servers };
}

function encodePath(p: string): string {
  return p.replace(/\//g, "-");
}

function scanGlobal() {
  const memoryPath = path.join(CLAUDE_DIR, "projects", encodePath(HOME), "memory");
  const settingsJson = path.join(CLAUDE_DIR, "settings.json");
  const settingsLocalJson = path.join(CLAUDE_DIR, "settings.local.json");

  const nodes: ConfigNode[] = [
    fileNode("CLAUDE.md", path.join(CLAUDE_DIR, "CLAUDE.md")),
    fileNode("CLAUDE.local.md", path.join(CLAUDE_DIR, "CLAUDE.local.md")),
    dirNode("commands", path.join(CLAUDE_DIR, "commands")),
    dirNode("skills", path.join(CLAUDE_DIR, "skills")),
    dirNode("rules", path.join(CLAUDE_DIR, "rules")),
    dirNode("agents", path.join(CLAUDE_DIR, "agents")),
    dirNode("memory", memoryPath),
    fileNode("settings.json", settingsJson),
    fileNode("settings.local.json", settingsLocalJson),
    hooksNode(settingsJson),
    detectCliTools(),
    mcpNode(settingsJson, settingsLocalJson),
  ];

  return { basePath: CLAUDE_DIR, displayPath: "~/.claude/", nodes };
}

function scanProject(projectPath: string) {
  const dotClaude = path.join(projectPath, ".claude");
  const memoryPath = path.join(CLAUDE_DIR, "projects", encodePath(projectPath), "memory");
  const projSettings = path.join(dotClaude, "settings.json");
  const projSettingsLocal = path.join(dotClaude, "settings.local.json");

  const dotClaudeChildren: ConfigNode[] = [
    dirNode("rules", path.join(dotClaude, "rules")),
    dirNode("commands", path.join(dotClaude, "commands")),
    dirNode("agents", path.join(dotClaude, "agents")),
    dirNode("memory", memoryPath),
    fileNode("settings.json", projSettings),
    fileNode("settings.local.json", projSettingsLocal),
    hooksNode(projSettings),
    mcpNode(projSettings, projSettingsLocal),
  ];

  const nodes: ConfigNode[] = [
    fileNode("CLAUDE.md", path.join(projectPath, "CLAUDE.md")),
    fileNode("CLAUDE.local.md", path.join(projectPath, "CLAUDE.local.md")),
    { name: ".claude/", path: dotClaude, kind: "dir", exists: fs.existsSync(dotClaude), children: dotClaudeChildren },
  ];

  const projName = path.basename(projectPath);
  return { basePath: projectPath, displayPath: `~/Projects/${projName}/`, nodes };
}

function getProjectList() {
  try {
    return fs
      .readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(PROJECTS_DIR, e.name) }));
  } catch {
    return [];
  }
}

// --- Handlers ---

export async function GET(req: NextRequest) {
  const fileParam = req.nextUrl.searchParams.get("file");

  // Read single file
  if (fileParam) {
    const resolved = path.resolve(fileParam);
    try {
      const content = fs.readFileSync(resolved, "utf-8");
      return NextResponse.json({ content });
    } catch {
      return NextResponse.json({ content: "" });
    }
  }

  const projectPath = req.nextUrl.searchParams.get("project");
  const global = scanGlobal();
  const project = projectPath ? scanProject(projectPath) : null;
  const projects = getProjectList();
  return NextResponse.json({ global, project, projects });
}

export async function PUT(req: NextRequest) {
  try {
    const { filePath, content } = await req.json();
    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(CLAUDE_DIR) && !resolved.startsWith(PROJECTS_DIR) && !resolved.startsWith(HOME)) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
    return NextResponse.json({ ok: true, lines: content.split("\n").length });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { filePath, isDirectory, template } = await req.json();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(CLAUDE_DIR) && !resolved.startsWith(PROJECTS_DIR) && !resolved.startsWith(HOME)) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }
    if (isDirectory) {
      fs.mkdirSync(resolved, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, template || "", "utf-8");
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
