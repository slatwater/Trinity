import { create } from "zustand";
import { Message } from "@/lib/types";

interface ChatState {
  sessions: Record<string, Message[]>;
  isLoading: Record<string, boolean>;

  addMessage: (projectId: string, message: Message) => void;
  appendToLastMessage: (projectId: string, content: string) => void;
  setLoading: (projectId: string, loading: boolean) => void;
  clearSession: (projectId: string) => void;
  hydrate: () => void;
}

const STORAGE_KEY = "trinity-chat-sessions";

function saveToStorage(sessions: Record<string, Message[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch { /* quota exceeded or SSR */ }
}

function loadFromStorage(): Record<string, Message[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  isLoading: {},

  addMessage: (projectId, message) =>
    set((state) => {
      const sessions = {
        ...state.sessions,
        [projectId]: [...(state.sessions[projectId] || []), message],
      };
      saveToStorage(sessions);
      return { sessions };
    }),

  appendToLastMessage: (projectId, content) =>
    set((state) => {
      const messages = state.sessions[projectId] || [];
      if (messages.length === 0) return state;
      const last = messages[messages.length - 1];
      const sessions = {
        ...state.sessions,
        [projectId]: [
          ...messages.slice(0, -1),
          { ...last, content: last.content + content },
        ],
      };
      saveToStorage(sessions);
      return { sessions };
    }),

  setLoading: (projectId, loading) =>
    set((state) => ({
      isLoading: { ...state.isLoading, [projectId]: loading },
    })),

  clearSession: (projectId) =>
    set((state) => {
      const sessions = { ...state.sessions, [projectId]: [] };
      saveToStorage(sessions);
      return { sessions };
    }),

  hydrate: () => {
    const sessions = loadFromStorage();
    set({ sessions });
  },
}));
