export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  language?: string;
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
}

export interface ProjectWorkflow {
  project_id: string;
  status: "busy" | "idle";
  stages: WorkflowStage[];
}

export type AutoPilotPhase =
  | "clarifying"
  | "generating_spec"
  | "writing_tests"
  | "waiting_merge"
  | "writing_code"
  | "waiting_ci"
  | "fixing"
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
