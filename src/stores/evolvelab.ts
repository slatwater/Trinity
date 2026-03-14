import { create } from "zustand";

// ── Types (shared with page.tsx) ─────────────────────────

export interface ExperimentResult {
  exp: number;
  accuracy: number;
  correct: string;
  cost: number;
  time_s: number;
  status: "keep" | "discard" | "crash";
  description: string;
}

export interface PromptConfig {
  system_prompt: string;
  few_shot_examples: string[][];
  format_instruction: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  strategyModel: string;
  targetModel: string;
  numRounds: number;
  bestAccuracy: number;
  totalCost: number;
  results: ExperimentResult[];
  bestConfig: PromptConfig | null;
}

export type Phase = "idle" | "starting" | "baseline" | "suggesting" | "evaluating" | "done" | "error";

export interface ModelConfig {
  presetId: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  sdkModel?: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  sdkModel?: string;
  strategyOnly?: boolean;
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: "sdk-sonnet", name: "Sonnet 4.6", provider: "sdk", sdkModel: "sonnet", model: "", baseUrl: "", strategyOnly: true },
  { id: "sdk-haiku", name: "Haiku 4.5", provider: "sdk", sdkModel: "haiku", model: "", baseUrl: "", strategyOnly: true },
  { id: "sdk-opus", name: "Opus 4.6", provider: "sdk", sdkModel: "opus", model: "", baseUrl: "", strategyOnly: true },
  { id: "deepseek-chat", name: "DeepSeek V3", provider: "openai", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
  { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "openai", model: "deepseek-reasoner", baseUrl: "https://api.deepseek.com" },
  { id: "custom", name: "Custom", provider: "openai", model: "", baseUrl: "" },
];

const STORAGE_KEY = "trinity-evolvelab-config";

// ── Store ────────────────────────────────────────────────

interface EvolveLabState {
  // Config
  strategy: ModelConfig;
  target: ModelConfig;
  numExperiments: number;
  maxConcurrency: number;

  // Runtime
  phase: Phase;
  experimentId: string | null;
  currentExp: number;
  progress: { completed: number; total: number; correct: number };
  results: ExperimentResult[];
  bestAccuracy: number;
  bestConfig: PromptConfig | null;
  currentSuggestion: string | null;
  error: string | null;

  // History
  history: HistoryEntry[];
  viewingHistory: HistoryEntry | null;

  // Actions
  setStrategy: (s: ModelConfig) => void;
  setTarget: (t: ModelConfig) => void;
  setNumExperiments: (n: number) => void;
  setMaxConcurrency: (n: number) => void;
  startExperiment: () => void;
  cancelExperiment: () => void;
  loadHistory: () => void;
  viewHistory: (entry: HistoryEntry) => void;
  closeHistory: () => void;
  deleteHistory: (id: string) => void;
}

let abortController: AbortController | null = null;

function handleEvent(event: Record<string, unknown>) {
  const { setState, getState } = useEvolveLabStore;

  switch (event.type) {
    case "started":
      setState({ experimentId: event.id as string });
      break;
    case "phase":
      setState({
        phase: event.phase as Phase,
        currentExp: event.exp as number,
        progress: { completed: 0, total: 200, correct: 0 },
        currentSuggestion: event.phase === "suggesting" ? getState().currentSuggestion : null,
      });
      break;
    case "progress":
      setState({
        progress: {
          completed: event.completed as number,
          total: event.total as number,
          correct: event.correct as number,
        },
      });
      break;
    case "suggestion":
      setState({ currentSuggestion: event.description as string });
      break;
    case "result": {
      const r = event.result as ExperimentResult;
      const prev = getState().results;
      setState({
        results: [...prev, r],
        bestAccuracy: r.status === "keep" ? r.accuracy : getState().bestAccuracy,
      });
      break;
    }
    case "done": {
      const ba = event.best_accuracy as number;
      const bc = event.best_config as PromptConfig;
      const allResults = event.results as ExperimentResult[] | undefined;
      setState({ phase: "done", bestAccuracy: ba, bestConfig: bc });

      if (allResults) {
        const { strategy, target } = getState();
        const sPreset = MODEL_PRESETS.find((p) => p.id === strategy.presetId);
        const tPreset = MODEL_PRESETS.find((p) => p.id === target.presetId);
        const entry: HistoryEntry = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          timestamp: new Date().toISOString(),
          strategyModel: sPreset?.name || strategy.model || "unknown",
          targetModel: tPreset?.name || target.model || "unknown",
          numRounds: allResults.length,
          bestAccuracy: ba,
          totalCost: allResults.reduce((s, r) => s + r.cost, 0),
          results: allResults,
          bestConfig: bc,
        };
        setState({ history: [entry, ...getState().history] });
        fetch("/api/evolvelab/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        }).catch(() => {});
      }
      abortController = null;
      break;
    }
    case "error":
      setState({ phase: "error", error: event.message as string });
      abortController = null;
      break;
  }
}

async function runSSE(strategy: ModelConfig, target: ModelConfig, numExperiments: number, maxConcurrency: number) {
  const { setState } = useEvolveLabStore;
  const abort = new AbortController();
  abortController = abort;

  try {
    const res = await fetch("/api/evolvelab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: {
          provider: strategy.provider,
          apiKey: strategy.apiKey,
          baseUrl: strategy.baseUrl,
          model: strategy.model,
          sdkModel: strategy.sdkModel,
        },
        target: {
          provider: target.provider,
          apiKey: target.apiKey,
          baseUrl: target.baseUrl,
          model: target.model,
        },
        numExperiments,
        maxConcurrent: maxConcurrency,
      }),
      signal: abort.signal,
    });

    if (!res.ok) {
      setState({ phase: "error", error: "Failed to start experiment" });
      abortController = null;
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    let buf = "";
    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (!value) continue;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          handleEvent(JSON.parse(line.slice(6)));
        } catch {
          /* skip */
        }
      }
    }

    if (buf.startsWith("data: ")) {
      try {
        handleEvent(JSON.parse(buf.slice(6)));
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      setState({ phase: "error", error: (e as Error).message });
    }
    abortController = null;
  }
}

export const useEvolveLabStore = create<EvolveLabState>((set, get) => {
  // Load saved config
  let initStrategy: ModelConfig = {
    presetId: "sdk-sonnet", provider: "sdk", sdkModel: "sonnet", apiKey: "", baseUrl: "", model: "",
  };
  let initTarget: ModelConfig = {
    presetId: "deepseek-chat", provider: "openai", apiKey: "", baseUrl: "https://api.deepseek.com", model: "deepseek-chat",
  };
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.strategy) initStrategy = { ...initStrategy, ...cfg.strategy };
        if (cfg.target) initTarget = { ...initTarget, ...cfg.target };
      }
    } catch { /* ignore */ }
  }

  return {
    strategy: initStrategy,
    target: initTarget,
    numExperiments: 5,
    maxConcurrency: 20,

    phase: "idle",
    experimentId: null,
    currentExp: 0,
    progress: { completed: 0, total: 200, correct: 0 },
    results: [],
    bestAccuracy: 0,
    bestConfig: null,
    currentSuggestion: null,
    error: null,

    history: [],
    viewingHistory: null,

    setStrategy: (s) => set({ strategy: s }),
    setTarget: (t) => set({ target: t }),
    setNumExperiments: (n) => set({ numExperiments: n }),
    setMaxConcurrency: (n) => set({ maxConcurrency: n }),

    startExperiment: () => {
      const { strategy, target, numExperiments, maxConcurrency } = get();
      const strategyReady = strategy.provider === "sdk" || !!strategy.apiKey;
      if (!strategyReady || !target.apiKey) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ strategy, target }));

      set({
        phase: "starting",
        results: [],
        bestAccuracy: 0,
        bestConfig: null,
        error: null,
        currentSuggestion: null,
        viewingHistory: null,
      });

      runSSE(strategy, target, numExperiments, maxConcurrency);
    },

    cancelExperiment: () => {
      abortController?.abort();
      abortController = null;
      const id = get().experimentId;
      if (id) {
        fetch(`/api/evolvelab/${id}`, { method: "DELETE" }).catch(() => {});
      }
      set({ phase: "idle" });
    },

    loadHistory: () => {
      fetch("/api/evolvelab/history")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) set({ history: data });
        })
        .catch(() => {});
    },

    viewHistory: (entry) => {
      set({
        viewingHistory: entry,
        results: entry.results,
        bestAccuracy: entry.bestAccuracy,
        bestConfig: entry.bestConfig,
        phase: "done",
      });
    },

    closeHistory: () => {
      set({
        viewingHistory: null,
        results: [],
        bestAccuracy: 0,
        bestConfig: null,
        phase: "idle",
      });
    },

    deleteHistory: (id) => {
      set({ history: get().history.filter((e) => e.id !== id) });
      fetch("/api/evolvelab/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    },
  };
});
