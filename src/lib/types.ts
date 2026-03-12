export interface ProjectConfig {
  type: "claude-hooks" | "git-hooks" | "rules" | "mcp";
  label: string;
  items: string[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  version?: string;
  versionMessage?: string;
  claudeMdContent?: string;
  configs: ProjectConfig[];
  lastModified: string;
  hasGit: boolean;
  hasClaude: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface WorkflowStage {
  name: string;
  status: "completed" | "active";
  count?: number;
}

export interface ProjectWorkflow {
  project_id: string;
  status: "busy" | "idle";
  stages: WorkflowStage[];
}

// ── News ──

export interface TweetData {
  ok: boolean;
  username?: string;
  text?: string;
  timestamp?: string;
  url?: string;
  error?: string;
}

export interface NewsCategoryData {
  summary: string;
  tweets: TweetData[];
}

export interface NewsData {
  date: string;
  fetched_at: string;
  categories: Record<string, NewsCategoryData>;
}

export interface NewsConfig {
  claude: string[];
  openai: string[];
  gemini: string[];
}

// ── Auto Pilot ──

export type AutoPilotPhase =
  | "clarifying"
  | "generating_spec"
  | "writing_tests"
  | "waiting_merge"
  | "writing_code"
  | "waiting_ci"
  | "fixing"
  | "merging"
  | "done"
  | "error";

export interface AutoPilotAgent {
  id: string;
  status: "idle" | "busy";
  messages: { role: string; content: string }[];
  workflow: ProjectWorkflow | null;
}

export interface AutoPilotStatus {
  id: string;
  project_id: string;
  phase: AutoPilotPhase;
  requirement: string;
  branch_name: string;
  spec: string | null;
  test_pr_url: string | null;
  feat_pr_url: string | null;
  error: string | null;
  agent_a: AutoPilotAgent;
  agent_b: AutoPilotAgent;
}
