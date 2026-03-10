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

export interface Task {
  id: string;
  projectId: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ChatSession {
  projectId: string;
  messages: Message[];
  isLoading: boolean;
}

export interface ClaudeStreamEvent {
  type: string;
  content?: string;
  message?: string;
  tool?: string;
  result?: string;
}
