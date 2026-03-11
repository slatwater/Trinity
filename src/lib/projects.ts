import { readdir, stat, readFile, access } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { Project, ProjectConfig } from "./types";

const execAsync = promisify(exec);
const WORKSPACE_ROOT = process.env.TRINITY_WORKSPACE || join(process.env.HOME || "~", "Projects");

// Files/dirs to skip when scanning
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".DS_Store"]);

export async function scanProjects(): Promise<Project[]> {
  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
  const projects: Project[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;

    const fullPath = join(WORKSPACE_ROOT, entry.name);
    const project = await inspectProject(fullPath, entry.name);
    if (project) projects.push(project);
  }

  // Sort by last modified, newest first
  projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  return projects;
}

async function inspectProject(fullPath: string, name: string): Promise<Project | null> {
  const stats = await stat(fullPath);

  const hasGit = await exists(join(fullPath, ".git"));
  const hasClaude = await exists(join(fullPath, "CLAUDE.md"));

  const { version, versionMessage } = hasGit ? await getVersionInfo(fullPath) : {};
  const claudeMdContent = hasClaude ? await readFileSafe(join(fullPath, "CLAUDE.md")) : undefined;
  const configs = await getConfigs(fullPath);

  return {
    id: Buffer.from(fullPath).toString("base64url"),
    name,
    path: fullPath,
    version,
    versionMessage,
    claudeMdContent,
    configs,
    lastModified: stats.mtime.toISOString(),
    hasGit,
    hasClaude,
  };
}

async function getVersionInfo(dir: string): Promise<{ version?: string; versionMessage?: string }> {
  try {
    const { stdout: tagOut } = await execAsync("git describe --tags --abbrev=0 2>/dev/null", { cwd: dir });
    const version = tagOut.trim();
    if (!version) return {};

    const { stdout: msgOut } = await execAsync(`git log -1 --format=%s "${version}" 2>/dev/null`, { cwd: dir });
    let versionMessage = msgOut.trim();

    // Strip version prefix like "v3.1: " from message
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    versionMessage = versionMessage.replace(new RegExp(`^${escaped}[:\\s]*`), "");

    return { version, versionMessage: versionMessage || undefined };
  } catch {
    return {};
  }
}

async function getConfigs(dir: string): Promise<ProjectConfig[]> {
  const configs: ProjectConfig[] = [];

  // Claude Code hooks
  const claudeHookItems: string[] = [];
  for (const file of ["settings.json", "settings.local.json"]) {
    try {
      const content = JSON.parse(await readFile(join(dir, ".claude", file), "utf-8"));
      if (content.hooks) {
        claudeHookItems.push(...Object.keys(content.hooks));
      }
    } catch { /* ignore */ }
  }
  if (claudeHookItems.length > 0) {
    configs.push({ type: "claude-hooks", label: "Claude Hooks", items: [...new Set(claudeHookItems)] });
  }

  // Git hooks (exclude .sample files)
  try {
    const entries = await readdir(join(dir, ".git", "hooks"));
    const activeHooks = entries.filter(f => !f.endsWith(".sample") && !f.startsWith("."));
    if (activeHooks.length > 0) {
      configs.push({ type: "git-hooks", label: "Git Hooks", items: activeHooks });
    }
  } catch { /* ignore */ }

  // Claude rules
  try {
    const entries = await readdir(join(dir, ".claude", "rules"));
    const ruleFiles = entries.filter(f => f.endsWith(".md"));
    if (ruleFiles.length > 0) {
      configs.push({ type: "rules", label: "Rules", items: ruleFiles });
    }
  } catch { /* ignore */ }

  // MCP servers (from .mcp.json and .claude/settings.json)
  const mcpItems: string[] = [];
  try {
    const content = JSON.parse(await readFile(join(dir, ".mcp.json"), "utf-8"));
    mcpItems.push(...Object.keys(content.mcpServers || {}));
  } catch { /* ignore */ }
  try {
    const content = JSON.parse(await readFile(join(dir, ".claude", "settings.json"), "utf-8"));
    if (content.mcpServers) {
      mcpItems.push(...Object.keys(content.mcpServers));
    }
  } catch { /* ignore */ }
  if (mcpItems.length > 0) {
    configs.push({ type: "mcp", label: "MCP", items: [...new Set(mcpItems)] });
  }

  return configs;
}

async function readFileSafe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function getWorkspaceRoot() {
  return WORKSPACE_ROOT;
}
