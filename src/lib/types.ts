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
