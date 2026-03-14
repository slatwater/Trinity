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
  strategyDetails: StrategyDetail[];
  errors: ErrorEntry[];
}

export interface StrategyDetail {
  exp: number;
  inputConfig: PromptConfig;
  inputHistory: string;
  rawOutput: string;
  description: string;
  outputConfig: PromptConfig | null;
}

export interface ErrorEntry {
  exp: number;
  question: string;
  error: string;
}

export interface EvalTemplate {
  id: string;
  name: string;
  description: string;
  dataset: string;
  checkMode: "numeric" | "exact" | "llm_judge";
  judgePrompt: string;
  scoreMax: number;
  strategyHint: string;
  defaultConfig: PromptConfig;
}

export const EVAL_TEMPLATES: EvalTemplate[] = [
  {
    id: "gsm8k",
    name: "GSM8K Math",
    description: "",
    dataset: "gsm8k_eval.jsonl",
    checkMode: "numeric",
    judgePrompt: "",
    scoreMax: 1,
    strategyHint: "a math-solving prompt for GSM8K grade school math problems",
    defaultConfig: {
      system_prompt: "You are a helpful math tutor. Solve the problem step by step.",
      few_shot_examples: [],
      format_instruction: "Show your work, then give the final answer as: #### <number>",
    },
  },
  {
    id: "customer_service",
    name: "Customer Service",
    description: "",
    dataset: "customer_service.jsonl",
    checkMode: "llm_judge",
    judgePrompt: `你是客服质检评分员。请从以下四个维度综合评估回复质量，输出一个总分（1-5）。

评估维度（各占 25%）：
1. 同理心：是否理解客户情绪、表达关怀和歉意
2. 方案质量：解决方案是否具体、可行、步骤清晰
3. 要点覆盖：是否覆盖评判要点中列出的关键内容，有无重要遗漏
4. 专业度：流程是否准确、用语是否规范得体

评分标准：
- 5分：四个维度均表现优秀
- 4分：大部分维度表现良好，个别有小瑕疵
- 3分：部分维度有明显不足
- 2分：多个维度表现差
- 1分：答非所问或态度恶劣

用户问题：{question}
评判要点：{answer}
实际回复：{reply}

只输出一个数字分数（1-5），格式：#### 数字`,
    scoreMax: 5,
    strategyHint: "电商客服回复场景的提示词优化",
    defaultConfig: {
      system_prompt: "你是一位专业的电商客服代表。请用友好、专业的语气回复客户问题。",
      few_shot_examples: [],
      format_instruction: "回复要求：1. 表达对客户的理解和同理心 2. 给出具体、可行的解决方案和操作步骤 3. 确保覆盖问题涉及的所有关键点 4. 用语规范专业",
    },
  },
];

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
  // Anthropic API models — for judge role
  { id: "anthropic-sonnet", name: "Claude Sonnet 4", provider: "anthropic", model: "claude-sonnet-4-20250514", baseUrl: "https://api.anthropic.com/v1" },
  { id: "anthropic-haiku", name: "Claude Haiku 4.5", provider: "anthropic", model: "claude-haiku-4-20250514", baseUrl: "https://api.anthropic.com/v1" },
  { id: "custom", name: "Custom", provider: "openai", model: "", baseUrl: "" },
];

const STORAGE_KEY = "trinity-evolvelab-config";

// ── Store ────────────────────────────────────────────────

interface EvolveLabState {
  // Config
  selectedTemplateId: string;
  strategy: ModelConfig;
  target: ModelConfig;
  judge: ModelConfig;
  numExperiments: number;
  maxConcurrency: number;

  // Editable prompts (initialized from template)
  targetSystemPrompt: string;
  targetFormatInstruction: string;
  judgePrompt: string;
  strategyHint: string;
  setTargetSystemPrompt: (s: string) => void;
  setTargetFormatInstruction: (s: string) => void;
  setJudgePrompt: (s: string) => void;
  setStrategyHint: (s: string) => void;

  // Runtime
  phase: Phase;
  experimentId: string | null;
  currentExp: number;
  progress: { completed: number; total: number; correct: number | string };
  results: ExperimentResult[];
  bestAccuracy: number;
  bestConfig: PromptConfig | null;
  currentSuggestion: string | null;
  error: string | null;
  strategyDetails: StrategyDetail[];
  errors: ErrorEntry[];

  // History
  history: HistoryEntry[];
  viewingHistory: HistoryEntry | null;

  // Actions
  setTemplate: (id: string) => void;
  setStrategy: (s: ModelConfig) => void;
  setTarget: (t: ModelConfig) => void;
  setJudge: (j: ModelConfig) => void;
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
    case "strategy_detail": {
      const detail: StrategyDetail = {
        exp: event.exp as number,
        inputConfig: event.input_config as PromptConfig,
        inputHistory: event.input_history as string,
        rawOutput: event.raw_output as string,
        description: event.description as string,
        outputConfig: event.output_config as PromptConfig | null,
      };
      setState({ strategyDetails: [...getState().strategyDetails, detail] });
      break;
    }
    case "eval_error": {
      const err: ErrorEntry = {
        exp: event.exp as number,
        question: event.question as string,
        error: event.error as string,
      };
      setState({ errors: [...getState().errors, err] });
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
          strategyDetails: getState().strategyDetails,
          errors: getState().errors,
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

async function runSSE(strategy: ModelConfig, target: ModelConfig, judge: ModelConfig, numExperiments: number, maxConcurrency: number, template: EvalTemplate) {
  const { setState, getState } = useEvolveLabStore;
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
        ...(template.checkMode === "llm_judge" ? {
          judge: {
            provider: "sdk",
            sdkModel: judge.sdkModel || "sonnet",
          },
        } : {}),
        template: {
          dataset: template.dataset,
          checkMode: template.checkMode,
          judgePrompt: getState().judgePrompt,
          scoreMax: template.scoreMax,
          strategyHint: getState().strategyHint,
          defaultConfig: {
            system_prompt: getState().targetSystemPrompt,
            few_shot_examples: template.defaultConfig.few_shot_examples,
            format_instruction: getState().targetFormatInstruction,
          },
        },
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
  let initJudge: ModelConfig = {
    presetId: "sdk-sonnet", provider: "sdk", sdkModel: "sonnet", apiKey: "", baseUrl: "", model: "",
  };
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.strategy) initStrategy = { ...initStrategy, ...cfg.strategy };
        if (cfg.target) initTarget = { ...initTarget, ...cfg.target };
        if (cfg.judge) initJudge = { ...initJudge, ...cfg.judge };
      }
    } catch { /* ignore */ }
  }

  return {
    selectedTemplateId: "gsm8k",
    strategy: initStrategy,
    target: initTarget,
    judge: initJudge,
    numExperiments: 5,
    maxConcurrency: 5,

    targetSystemPrompt: EVAL_TEMPLATES[0].defaultConfig.system_prompt,
    targetFormatInstruction: EVAL_TEMPLATES[0].defaultConfig.format_instruction,
    judgePrompt: EVAL_TEMPLATES[0].judgePrompt,
    strategyHint: EVAL_TEMPLATES[0].strategyHint,
    setTargetSystemPrompt: (s) => set({ targetSystemPrompt: s }),
    setTargetFormatInstruction: (s) => set({ targetFormatInstruction: s }),
    setJudgePrompt: (s) => set({ judgePrompt: s }),
    setStrategyHint: (s) => set({ strategyHint: s }),

    phase: "idle",
    experimentId: null,
    currentExp: 0,
    progress: { completed: 0, total: 200, correct: 0 },
    results: [],
    bestAccuracy: 0,
    bestConfig: null,
    currentSuggestion: null,
    error: null,
    strategyDetails: [],
    errors: [],

    history: [],
    viewingHistory: null,

    setTemplate: (id) => {
      const t = EVAL_TEMPLATES.find(x => x.id === id) || EVAL_TEMPLATES[0];
      set({
        selectedTemplateId: id,
        targetSystemPrompt: t.defaultConfig.system_prompt,
        targetFormatInstruction: t.defaultConfig.format_instruction,
        judgePrompt: t.judgePrompt,
        strategyHint: t.strategyHint,
      });
    },
    setStrategy: (s) => set({ strategy: s }),
    setTarget: (t) => set({ target: t }),
    setJudge: (j) => set({ judge: j }),
    setNumExperiments: (n) => set({ numExperiments: n }),
    setMaxConcurrency: (n) => set({ maxConcurrency: n }),

    startExperiment: () => {
      const { strategy, target, judge, numExperiments, maxConcurrency, selectedTemplateId } = get();
      const template = EVAL_TEMPLATES.find(t => t.id === selectedTemplateId) || EVAL_TEMPLATES[0];
      const strategyReady = strategy.provider === "sdk" || !!strategy.apiKey;
      if (!strategyReady || !target.apiKey) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ strategy, target, judge }));

      set({
        phase: "starting",
        results: [],
        bestAccuracy: 0,
        bestConfig: null,
        error: null,
        currentSuggestion: null,
        strategyDetails: [],
        errors: [],
        viewingHistory: null,
      });

      runSSE(strategy, target, judge, numExperiments, maxConcurrency, template);
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
        strategyDetails: entry.strategyDetails || [],
        errors: entry.errors || [],
        phase: "done",
      });
    },

    closeHistory: () => {
      set({
        viewingHistory: null,
        results: [],
        bestAccuracy: 0,
        bestConfig: null,
        strategyDetails: [],
        errors: [],
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
