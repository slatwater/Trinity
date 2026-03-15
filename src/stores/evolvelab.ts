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
  dimensions?: Record<string, number>;
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
  judgeDetails: JudgeDetail[];
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

export interface JudgeDetail {
  exp: number;
  question: string;
  reference: string;
  reply: string;
  reasoning: string;
  dimensions: Record<string, number>;
  score: number;
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
      system_prompt: "Read the problem carefully and identify what is being asked.\nSolve step by step — after each calculation, verify the arithmetic before moving on.\nWhen finished, re-read the original question to confirm your answer addresses it correctly.",
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
    judgePrompt: `请从四个维度分别评估客服回复质量，每个维度独立打 1-5 分。

维度定义：
- empathy（同理心）：是否理解客户情绪、表达关怀和歉意
- solution（方案质量）：解决方案是否具体、可行、步骤清晰
- coverage（要点覆盖）：是否覆盖评判要点中列出的关键内容
- professionalism（专业度）：流程是否准确、用语是否规范得体

评分锚点：5=优秀 4=良好 3=有明显不足 2=差 1=完全不合格

用户问题：{question}
评判要点：{answer}
实际回复：{reply}

请先逐维度简要说明评分理由（每个维度一句话），然后在最后一行按格式输出分数：
#### empathy:分数,solution:分数,coverage:分数,professionalism:分数`,
    scoreMax: 5,
    strategyHint: "电商客服回复场景的提示词优化",
    defaultConfig: {
      system_prompt: "收到客户问题后，按以下步骤组织回复：\n1. 先确认客户的问题和情绪，用一句话表达理解（不要套话）\n2. 给出具体的解决方案，包含可操作的步骤\n3. 如有需要，主动说明后续跟进方式或预防建议",
      few_shot_examples: [],
      format_instruction: "直接回复客户，不要输出分析过程。语气专业但自然，避免模板化表达。",
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
  judgeDetails: JudgeDetail[];

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
    case "judge_detail": {
      const jd: JudgeDetail = {
        exp: event.exp as number,
        question: event.question as string,
        reference: event.reference as string,
        reply: event.reply as string,
        reasoning: event.reasoning as string,
        dimensions: event.dimensions as Record<string, number>,
        score: event.score as number,
      };
      setState({ judgeDetails: [...getState().judgeDetails, jd] });
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
          judgeDetails: getState().judgeDetails,
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
    judgeDetails: [],

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
      const { phase: currentPhase, strategy, target, judge, numExperiments, maxConcurrency, selectedTemplateId, experimentId } = get();
      if (currentPhase !== "idle" && currentPhase !== "done" && currentPhase !== "error") return;

      const template = EVAL_TEMPLATES.find(t => t.id === selectedTemplateId) || EVAL_TEMPLATES[0];
      const strategyReady = strategy.provider === "sdk" || !!strategy.apiKey;
      if (!strategyReady || !target.apiKey) return;

      // Cancel any lingering SSE / backend experiment
      abortController?.abort();
      abortController = null;
      if (experimentId) {
        fetch(`/api/evolvelab/${experimentId}`, { method: "DELETE" }).catch(() => {});
      }

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
        judgeDetails: [],
        viewingHistory: null,
        experimentId: null,
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
        judgeDetails: entry.judgeDetails || [],
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
        judgeDetails: [],
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
