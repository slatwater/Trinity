import { readdir, stat, readFile, access } from "fs/promises";
import { join } from "path";
import { Project } from "./types";

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

  // Try to detect language from common files
  const language = await detectLanguage(fullPath);

  // Try to get description from package.json or CLAUDE.md
  const description = await getDescription(fullPath);

  return {
    id: Buffer.from(fullPath).toString("base64url"),
    name,
    path: fullPath,
    description,
    language,
    lastModified: stats.mtime.toISOString(),
    hasGit,
    hasClaude,
  };
}

async function detectLanguage(dir: string): Promise<string | undefined> {
  const markers: Record<string, string> = {
    "package.json": "JavaScript/TypeScript",
    "Cargo.toml": "Rust",
    "go.mod": "Go",
    "pyproject.toml": "Python",
    "requirements.txt": "Python",
    "mix.exs": "Elixir",
    "Gemfile": "Ruby",
    "pom.xml": "Java",
    "build.gradle": "Java/Kotlin",
    "CMakeLists.txt": "C/C++",
    "pubspec.yaml": "Dart/Flutter",
  };

  for (const [file, lang] of Object.entries(markers)) {
    if (await exists(join(dir, file))) return lang;
  }
  return undefined;
}

async function getDescription(dir: string): Promise<string | undefined> {
  // Try package.json
  try {
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
    if (pkg.description) return pkg.description;
  } catch { /* ignore */ }

  // Try first line of CLAUDE.md after #
  try {
    const claude = await readFile(join(dir, "CLAUDE.md"), "utf-8");
    const lines = claude.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) return trimmed.slice(0, 120);
    }
  } catch { /* ignore */ }

  return undefined;
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
