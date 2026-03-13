"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ───────────────────────────────────────────────

interface ModelConfig {
  presetId: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  sdkModel?: string;
}

interface ExperimentResult {
  exp: number;
  accuracy: number;
  correct: string;
  cost: number;
  time_s: number;
  status: "keep" | "discard" | "crash";
  description: string;
}

interface PromptConfig {
  system_prompt: string;
  few_shot_examples: string[][];
  format_instruction: string;
}

type Phase = "idle" | "starting" | "baseline" | "suggesting" | "evaluating" | "done" | "error";

// ── Model Presets ───────────────────────────────────────

interface ModelPreset {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  sdkModel?: string;
  strategyOnly?: boolean;
}

const MODEL_PRESETS: ModelPreset[] = [
  // SDK models — use built-in ClaudeAgentSDK, no API key needed (strategy only)
  { id: "sdk-sonnet", name: "Sonnet 4.6", provider: "sdk", sdkModel: "sonnet", model: "", baseUrl: "", strategyOnly: true },
  { id: "sdk-haiku", name: "Haiku 4.5", provider: "sdk", sdkModel: "haiku", model: "", baseUrl: "", strategyOnly: true },
  { id: "sdk-opus", name: "Opus 4.6", provider: "sdk", sdkModel: "opus", model: "", baseUrl: "", strategyOnly: true },
  // API models — need API key
  { id: "deepseek-chat", name: "DeepSeek V3", provider: "openai", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
  { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "openai", model: "deepseek-reasoner", baseUrl: "https://api.deepseek.com" },
  { id: "custom", name: "Custom", provider: "openai", model: "", baseUrl: "" },
];

// ── Constants ───────────────────────────────────────────

const STORAGE_KEY = "trinity-evolvelab-config";

const DEFAULT_STRATEGY: ModelConfig = {
  presetId: "sdk-sonnet",
  provider: "sdk",
  sdkModel: "sonnet",
  apiKey: "",
  baseUrl: "",
  model: "",
};

const DEFAULT_TARGET: ModelConfig = {
  presetId: "deepseek-chat",
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
};

// ── Page ────────────────────────────────────────────────

export default function EvolveLabPage() {
  const [strategy, setStrategy] = useState<ModelConfig>(DEFAULT_STRATEGY);
  const [target, setTarget] = useState<ModelConfig>(DEFAULT_TARGET);
  const [numExperiments, setNumExperiments] = useState(5);
  const [showConfig, setShowConfig] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [currentExp, setCurrentExp] = useState(0);
  const [progress, setProgress] = useState({ completed: 0, total: 200, correct: 0 });
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [bestAccuracy, setBestAccuracy] = useState(0);
  const [bestConfig, setBestConfig] = useState<PromptConfig | null>(null);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("experiments");

  const abortRef = useRef<AbortController | null>(null);

  // Load saved config
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.strategy) setStrategy((s) => ({ ...s, ...cfg.strategy }));
        if (cfg.target) setTarget((s) => ({ ...s, ...cfg.target }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "started":
        setExperimentId(event.id as string);
        break;
      case "phase":
        setPhase(event.phase as Phase);
        setCurrentExp(event.exp as number);
        setProgress({ completed: 0, total: 200, correct: 0 });
        if (event.phase !== "suggesting") setCurrentSuggestion(null);
        break;
      case "progress":
        setProgress({
          completed: event.completed as number,
          total: event.total as number,
          correct: event.correct as number,
        });
        break;
      case "suggestion":
        setCurrentSuggestion(event.description as string);
        break;
      case "result": {
        const r = event.result as ExperimentResult;
        setResults((prev) => [...prev, r]);
        if (r.status === "keep") setBestAccuracy(r.accuracy);
        break;
      }
      case "done":
        setPhase("done");
        setBestAccuracy(event.best_accuracy as number);
        setBestConfig(event.best_config as PromptConfig);
        break;
      case "error":
        setPhase("error");
        setError(event.message as string);
        break;
    }
  }, []);

  const strategyReady = strategy.provider === "sdk" || !!strategy.apiKey;
  const targetReady = !!target.apiKey;
  const canStart = strategyReady && targetReady;

  const handleStart = useCallback(async () => {
    if (!canStart) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ strategy, target }));

    setPhase("starting");
    setResults([]);
    setBestAccuracy(0);
    setBestConfig(null);
    setError(null);
    setCurrentSuggestion(null);
    setShowConfig(false);
    setActiveTab("experiments");

    const abort = new AbortController();
    abortRef.current = abort;

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
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        setPhase("error");
        setError("Failed to start experiment");
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
        setPhase("error");
        setError((e as Error).message);
      }
    }
  }, [strategy, target, numExperiments, handleEvent, canStart]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    if (experimentId) {
      fetch(`/api/evolvelab/${experimentId}`, { method: "DELETE" }).catch(() => {});
    }
    setPhase("idle");
  }, [experimentId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const isRunning = phase !== "idle" && phase !== "done" && phase !== "error";
  const hasResults = results.length > 0;
  const kept = results.filter((r) => r.status === "keep").length;
  const totalCost = results.reduce((s, r) => s + r.cost, 0);

  const strategyPreset = MODEL_PRESETS.find((p) => p.id === strategy.presetId);
  const targetPreset = MODEL_PRESETS.find((p) => p.id === target.presetId);

  return (
    <div className="min-h-screen relative" style={{ padding: "0 48px 80px" }}>
      <div
        style={{
          position: "absolute",
          top: -100,
          left: -80,
          width: 500,
          height: 500,
          background: "radial-gradient(circle, var(--ambient-warm) 0%, transparent 65%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="relative z-[1] mx-auto"
        style={{ maxWidth: 1060, animation: "fadeUp 0.6s both" }}
      >
        {/* Header */}
        <div className="drag" style={{ padding: "52px 0 0" }}>
          <div className="no-drag">
            <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
              <span style={badgeStyle}>EVOLVELAB</span>
              {isRunning && (
                <span
                  style={{
                    ...badgeStyle,
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.15)",
                    color: "var(--success)",
                  }}
                >
                  RUNNING
                </span>
              )}
              {phase === "done" && <span style={badgeStyle}>COMPLETE</span>}
            </div>
            <h1
              style={{
                fontSize: 52,
                fontFamily: "var(--font-serif)",
                fontWeight: 400,
                letterSpacing: "-0.04em",
                color: "var(--text-primary)",
                lineHeight: 1,
                margin: 0,
              }}
            >
              EvolveLab
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                marginTop: 10,
                fontFamily: "var(--font-sans)",
              }}
            >
              Autonomous prompt evolution — let one AI optimize another AI&apos;s prompt
            </p>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "var(--border-subtle)",
            margin: "28px 0 32px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ animation: "lineGrow 1.2s 0.3s both", height: "100%" }} />
        </div>

        {/* Config Section */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              padding: "4px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: showConfig ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
                fontSize: 10,
              }}
            >
              &#9654;
            </span>
            Model Configuration
            {!showConfig && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                {strategyPreset?.name || strategy.model} → {targetPreset?.name || target.model}
              </span>
            )}
          </button>

          {showConfig && (
            <div style={{ marginTop: 16, animation: "fadeUp 0.3s both" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <ModelConfigCard
                  title="Strategy Model"
                  subtitle="Analyzes results and generates optimization strategies"
                  config={strategy}
                  onChange={setStrategy}
                  disabled={isRunning}
                  accentColor="#d4a574"
                  role="strategy"
                />
                <ModelConfigCard
                  title="Target Model"
                  subtitle="The model being optimized — answers math problems"
                  config={target}
                  onChange={setTarget}
                  disabled={isRunning}
                  accentColor="#8070a8"
                  role="target"
                />
              </div>

              <div
                style={{
                  marginTop: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    Rounds
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={numExperiments}
                    onChange={(e) => setNumExperiments(parseInt(e.target.value))}
                    disabled={isRunning}
                    style={{ width: 160, accentColor: "var(--accent)" }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      minWidth: 20,
                    }}
                  >
                    {numExperiments}
                  </span>
                </div>

                {!isRunning ? (
                  <button
                    onClick={handleStart}
                    disabled={!canStart}
                    style={{
                      padding: "10px 28px",
                      borderRadius: 10,
                      border: "none",
                      background: canStart ? "var(--accent)" : "var(--bg-tertiary)",
                      color: canStart ? "var(--accent-text-on)" : "var(--text-muted)",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      cursor: canStart ? "pointer" : "not-allowed",
                      letterSpacing: "0.04em",
                      transition: "all 0.3s",
                    }}
                  >
                    Start Experiment
                  </button>
                ) : (
                  <button
                    onClick={handleCancel}
                    style={{
                      padding: "10px 28px",
                      borderRadius: 10,
                      border: "1px solid var(--error)",
                      background: "transparent",
                      color: "var(--error)",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Metrics */}
        {hasResults && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              marginBottom: 32,
              animation: "fadeUp 0.4s both",
            }}
          >
            <MetricCard label="Best Accuracy" value={`${(bestAccuracy * 100).toFixed(1)}%`} />
            <MetricCard label="Experiments" value={`${results.length}`} />
            <MetricCard label="Improvements" value={`${Math.max(0, kept - 1)}`} />
            <MetricCard label="Total Cost" value={`$${totalCost.toFixed(4)}`} />
          </div>
        )}

        {/* Error */}
        {phase === "error" && error && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "var(--error)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {/* Tabs + Content */}
        {(hasResults || isRunning) && (
          <>
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 24,
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {["experiments", "prompt", "data"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom:
                      activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                    color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    padding: "10px 16px",
                    cursor: "pointer",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                >
                  {tab === "experiments" ? "Experiments" : tab === "prompt" ? "Best Prompt" : "Data"}
                </button>
              ))}
            </div>

            {activeTab === "experiments" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {results.map((r) => (
                  <ExperimentCard key={r.exp} result={r} />
                ))}

                {isRunning && phase !== "starting" && (
                  <LiveExperimentCard
                    phase={phase}
                    currentExp={currentExp}
                    progress={progress}
                    suggestion={currentSuggestion}
                    isBaseline={currentExp === 0 && results.length === 0}
                  />
                )}

                {phase === "starting" && (
                  <div style={{ ...cardBase, color: "var(--text-muted)", textAlign: "center" }}>
                    Initializing...
                  </div>
                )}

                {phase === "done" && (
                  <div
                    style={{
                      ...cardBase,
                      background: "var(--accent-bg)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent)",
                      textAlign: "center",
                    }}
                  >
                    Complete — {results.length} rounds, {Math.max(0, kept - 1)} improvements, final
                    accuracy <strong>{(bestAccuracy * 100).toFixed(1)}%</strong>
                  </div>
                )}
              </div>
            )}

            {activeTab === "prompt" && (
              <div
                style={{
                  borderRadius: 14,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  overflow: "hidden",
                }}
              >
                {bestConfig ? (
                  <pre
                    style={{
                      padding: 24,
                      margin: 0,
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {configToCode(bestConfig)}
                  </pre>
                ) : (
                  <div
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {isRunning ? "Experiment in progress..." : "No results yet."}
                  </div>
                )}
              </div>
            )}

            {activeTab === "data" && (
              <div>
                {results.length > 1 && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: "20px 24px",
                      borderRadius: 14,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <AccuracyChart results={results} />
                  </div>
                )}

                <div
                  style={{
                    borderRadius: 14,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    overflow: "hidden",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        {["#", "Accuracy", "Correct", "Cost", "Time", "Status", "Description"].map(
                          (h) => (
                            <th key={h} style={thStyle}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.exp} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={tdStyle}>{r.exp}</td>
                          <td style={tdStyle}>{(r.accuracy * 100).toFixed(1)}%</td>
                          <td style={tdStyle}>{r.correct}</td>
                          <td style={tdStyle}>${r.cost.toFixed(4)}</td>
                          <td style={tdStyle}>{r.time_s}s</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background:
                                  r.status === "keep"
                                    ? "rgba(34,197,94,0.1)"
                                    : r.status === "discard"
                                      ? "rgba(239,68,68,0.08)"
                                      : "rgba(234,179,8,0.1)",
                                color:
                                  r.status === "keep"
                                    ? "var(--success)"
                                    : r.status === "discard"
                                      ? "var(--error)"
                                      : "var(--warning)",
                              }}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              maxWidth: 240,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {phase === "idle" && !hasResults && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "var(--text-muted)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
            }}
          >
            Configure strategy and target models above, then start the experiment.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Styles ───────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "5px 12px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  background: "var(--accent-bg)",
  border: "1px solid var(--accent-border)",
  color: "var(--accent)",
  letterSpacing: "0.08em",
  fontWeight: 600,
  textTransform: "uppercase",
};

const cardBase: React.CSSProperties = {
  padding: "18px 22px",
  borderRadius: 14,
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-subtle)",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const inputBaseStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const tdStyle: React.CSSProperties = { padding: "10px 14px", color: "var(--text-secondary)" };

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

// ── ModelConfigCard ─────────────────────────────────────

function ModelConfigCard({
  title,
  subtitle,
  config,
  onChange,
  disabled,
  accentColor,
  role,
}: {
  title: string;
  subtitle: string;
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
  disabled: boolean;
  accentColor: string;
  role: "strategy" | "target";
}) {
  const isCustom = config.presetId === "custom";
  const isSdk = config.provider === "sdk";
  const availablePresets = MODEL_PRESETS.filter((p) => role === "strategy" || !p.strategyOnly);

  const handlePresetChange = (presetId: string) => {
    const preset = availablePresets.find((p) => p.id === presetId);
    if (preset) {
      onChange({
        ...config,
        presetId: preset.id,
        provider: preset.provider,
        model: preset.model,
        baseUrl: preset.baseUrl,
        sdkModel: preset.sdkModel,
      });
    }
  };

  const selectStyle: React.CSSProperties = {
    ...inputBaseStyle,
    cursor: disabled ? "not-allowed" : "pointer",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237a7874'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 32,
  };

  return (
    <div
      style={{
        padding: "22px 24px",
        borderRadius: 14,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, opacity: 0.7 }}
        />
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-serif)",
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
        >
          {title}
        </span>
      </div>
      <p
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          margin: "0 0 16px",
          fontFamily: "var(--font-sans)",
        }}
      >
        {subtitle}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={labelStyle}>Model</label>
          <select
            value={config.presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={disabled}
            style={selectStyle}
          >
            {role === "strategy" && (
              <optgroup label="Built-in (no API key)">
                {availablePresets.filter((p) => p.strategyOnly).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={role === "strategy" ? "API (requires key)" : "Models"}>
              {availablePresets.filter((p) => !p.strategyOnly).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {isSdk && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--accent-bg)",
              border: "1px solid var(--accent-border)",
            }}
          >
            Uses built-in ClaudeAgentSDK — no API key needed
          </div>
        )}

        {!isSdk && (
          <div>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
              disabled={disabled}
              placeholder="sk-..."
              style={inputBaseStyle}
            />
          </div>
        )}

        {isCustom && (
          <>
            <div>
              <label style={labelStyle}>Provider</label>
              <select
                value={config.provider}
                onChange={(e) => onChange({ ...config, provider: e.target.value })}
                disabled={disabled}
                style={selectStyle}
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Base URL</label>
              <input
                value={config.baseUrl}
                onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
                disabled={disabled}
                placeholder="https://api.example.com"
                style={inputBaseStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Model ID</label>
              <input
                value={config.model}
                onChange={(e) => onChange({ ...config, model: e.target.value })}
                disabled={disabled}
                placeholder="model-name"
                style={inputBaseStyle}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── MetricCard ──────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 12,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          marginTop: 4,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── ExperimentCard ──────────────────────────────────────

function ExperimentCard({ result }: { result: ExperimentResult }) {
  const isKeep = result.status === "keep";
  const isBaseline = result.exp === 0;

  return (
    <div
      style={{
        ...cardBase,
        border: `1px solid ${isKeep ? "rgba(34,197,94,0.15)" : "var(--border-subtle)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 16 }}>
          {result.status === "keep" ? "\u2705" : result.status === "crash" ? "\uD83D\uDCA5" : "\u274C"}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {isBaseline ? "Baseline" : `Exp ${result.exp}`}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isKeep ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {(result.accuracy * 100).toFixed(1)}%
            </span>
            {isKeep && !isBaseline && (
              <span style={{ fontSize: 11, color: "var(--success)" }}>&#8593;</span>
            )}
          </div>
          {!isBaseline && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-sans)",
                marginTop: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {result.description}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{result.correct}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{result.time_s}s</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>${result.cost.toFixed(4)}</span>
      </div>
    </div>
  );
}

// ── LiveExperimentCard ──────────────────────────────────

function LiveExperimentCard({
  phase,
  currentExp,
  progress,
  suggestion,
  isBaseline,
}: {
  phase: Phase;
  currentExp: number;
  progress: { completed: number; total: number; correct: number };
  suggestion: string | null;
  isBaseline: boolean;
}) {
  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div style={{ ...cardBase, border: "1px solid var(--accent-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="animate-pulse" style={{ fontSize: 16 }}>
          {phase === "suggesting" ? "\uD83E\uDD14" : "\uD83D\uDD04"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {isBaseline ? "Baseline" : `Exp ${currentExp}`}
        </span>
        <span style={{ fontSize: 11, color: "var(--accent)" }}>
          {phase === "baseline" || phase === "evaluating" ? "evaluating..." : "thinking..."}
        </span>
      </div>

      {suggestion && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-sans)",
            marginBottom: 12,
          }}
        >
          Strategy: {suggestion}
        </div>
      )}

      {(phase === "baseline" || phase === "evaluating") && (
        <div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--bg-tertiary)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 3,
                background: "var(--accent)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span>
              {progress.completed}/{progress.total} — correct {progress.correct}
            </span>
            <span>{pct.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AccuracyChart ───────────────────────────────────────

function AccuracyChart({ results }: { results: ExperimentResult[] }) {
  const w = 1000;
  const h = 160;
  const pad = { top: 16, right: 24, bottom: 28, left: 50 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const accs = results.map((r) => r.accuracy);
  const minA = Math.min(...accs) - 0.02;
  const maxA = Math.min(Math.max(...accs) + 0.02, 1);

  const points = results.map((r, i) => {
    const x = pad.left + (cw / Math.max(results.length - 1, 1)) * i;
    const y = pad.top + ch - ((r.accuracy - minA) / (maxA - minA)) * ch;
    return { x, y, r };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      {[0, 0.5, 1].map((t) => {
        const val = minA + (maxA - minA) * (1 - t);
        const y = pad.top + ch * t;
        return (
          <g key={t}>
            <line
              x1={pad.left}
              y1={y}
              x2={w - pad.right}
              y2={y}
              stroke="var(--border-subtle)"
              strokeDasharray="4,4"
            />
            <text
              x={pad.left - 8}
              y={y + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {(val * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
      {points.map((p) => (
        <text
          key={p.r.exp}
          x={p.x}
          y={h - 4}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {p.r.exp}
        </text>
      ))}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {points.map((p) => (
        <circle
          key={p.r.exp}
          cx={p.x}
          cy={p.y}
          r={4}
          fill={
            p.r.status === "keep"
              ? "var(--success)"
              : p.r.status === "crash"
                ? "var(--error)"
                : "var(--text-muted)"
          }
          stroke="var(--bg-secondary)"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────

function configToCode(config: PromptConfig): string {
  const lines: string[] = [];
  lines.push(`SYSTEM_PROMPT = """\n${config.system_prompt}\n"""`);
  lines.push("");

  if (config.few_shot_examples && config.few_shot_examples.length > 0) {
    lines.push("FEW_SHOT_EXAMPLES = [");
    for (const [q, a] of config.few_shot_examples) {
      const qs = (q || "").slice(0, 80).replace(/\n/g, " ");
      const as = (a || "").slice(0, 80).replace(/\n/g, " ");
      lines.push(`    ("${qs}${q && q.length > 80 ? "..." : ""}",`);
      lines.push(`     "${as}${a && a.length > 80 ? "..." : ""}"),`);
    }
    lines.push("]");
  } else {
    lines.push("FEW_SHOT_EXAMPLES = []");
  }

  lines.push("");
  lines.push(`FORMAT_INSTRUCTION = "${config.format_instruction}"`);
  return lines.join("\n");
}
