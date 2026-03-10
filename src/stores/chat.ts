import { create } from "zustand";
import { Message, Task } from "@/lib/types";

interface ChatState {
  sessions: Record<string, Message[]>;
  tasks: Task[];
  activeProject: string | null;
  isLoading: Record<string, boolean>;

  addMessage: (projectId: string, message: Message) => void;
  appendToLastMessage: (projectId: string, content: string) => void;
  setLoading: (projectId: string, loading: boolean) => void;
  setActiveProject: (projectId: string | null) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  clearSession: (projectId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: {},
  tasks: [],
  activeProject: null,
  isLoading: {},

  addMessage: (projectId, message) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [projectId]: [...(state.sessions[projectId] || []), message],
      },
    })),

  appendToLastMessage: (projectId, content) =>
    set((state) => {
      const messages = state.sessions[projectId] || [];
      if (messages.length === 0) return state;
      const last = messages[messages.length - 1];
      return {
        sessions: {
          ...state.sessions,
          [projectId]: [
            ...messages.slice(0, -1),
            { ...last, content: last.content + content },
          ],
        },
      };
    }),

  setLoading: (projectId, loading) =>
    set((state) => ({
      isLoading: { ...state.isLoading, [projectId]: loading },
    })),

  setActiveProject: (projectId) => set({ activeProject: projectId }),

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    })),

  clearSession: (projectId) =>
    set((state) => ({
      sessions: { ...state.sessions, [projectId]: [] },
    })),
}));
