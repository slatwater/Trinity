"use client";

import { useState, useEffect } from "react";
import {
  useEvolveLabStore,
  MODEL_PRESETS,
  type ModelConfig,
  type ExperimentResult,
  type PromptConfig,
  type StrategyDetail,
  type ErrorEntry,
  type HistoryEntry,
  type Phase,
} from "@/stores/evolvelab";

// ── Page ────────────────────────────────────────────────

export default function EvolveLabPage() {
  const store = useEvolveLabStore();
  const [showConfig, setShowConfig] = useState(true);
  const [activeTab, setActiveTab] = useState("experiments");
  const [focusedStrategyExp, setFocusedStrategyExp] = useState<number | null>(null);

  const goToStrategy = (exp: number) => {
    setActiveTab("strategy");
    setFocusedStrategyExp(exp);
  };

  useEffect(() => {
    store.loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    strategy, target, numExperiments, maxConcurrency, phase, currentExp,
    progress, results, bestAccuracy, bestConfig, currentSuggestion,
    error, strategyDetails, errors, history, viewingHistory,
    setStrategy, setTarget, setNumExperiments, setMaxConcurrency,
    startExperiment, cancelExperiment,
    viewHistory, closeHistory, deleteHistory,
  } = store;

  const strategyReady = strategy.provider === "sdk" || !!strategy.apiKey;
  const targetReady = !!target.apiKey;
  const canStart = strategyReady && targetReady;

  const isRunning = phase !== "idle" && phase !== "done" && phase !== "error";
  const hasResults = results.length > 0;
  const kept = results.filter((r) => r.status === "keep").length;
  const totalCost = results.reduce((s, r) => s + r.cost, 0);

  const strategyPreset = MODEL_PRESETS.find((p) => p.id === strategy.presetId);
  const targetPreset = MODEL_PRESETS.find((p) => p.id === target.presetId);

  // Auto-collapse config when running
  useEffect(() => {
    if (isRunning) setShowConfig(false);
  }, [isRunning]);

  const handleStart = () => {
    startExperiment();
    setShowConfig(false);
    setActiveTab("experiments");
  };

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
              {phase === "done" && !viewingHistory && <span style={badgeStyle}>COMPLETE</span>}
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
        {!viewingHistory && (
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
                  {strategyPreset?.name || strategy.model} &rarr; {targetPreset?.name || target.model}
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
                      style={{ width: 120, accentColor: "var(--accent)" }}
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

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      Concurrency
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={maxConcurrency}
                      onChange={(e) => setMaxConcurrency(parseInt(e.target.value))}
                      disabled={isRunning}
                      style={{ width: 120, accentColor: "var(--accent)" }}
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
                      {maxConcurrency}
                    </span>
                  </div>

                  {!isRunning && (
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
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cancel bar — always visible when running */}
        {isRunning && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 18px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.04)",
              border: "1px solid rgba(239,68,68,0.12)",
              marginBottom: 20,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              Exp {currentExp} &middot; {phase === "starting" ? "initializing" : phase} &middot; {progress.completed}/{progress.total}
            </span>
            <button
              onClick={cancelExperiment}
              style={{
                background: "none",
                border: "1px solid var(--error)",
                borderRadius: 6,
                padding: "5px 16px",
                color: "var(--error)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancel Experiment
            </button>
          </div>
        )}

        {/* Viewing history banner */}
        {viewingHistory && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              borderRadius: 10,
              background: "var(--accent-bg)",
              border: "1px solid var(--accent-border)",
              marginBottom: 20,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--accent)",
            }}
          >
            <span>
              Viewing: {viewingHistory.strategyModel} &rarr; {viewingHistory.targetModel}
              {" \u00B7 "}
              {new Date(viewingHistory.timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={closeHistory}
              style={{
                background: "none",
                border: "1px solid var(--accent-border)",
                borderRadius: 6,
                padding: "5px 14px",
                color: "var(--accent)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
        )}

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
              {["experiments", "prompt", "data", "strategy", "errors"].map((tab) => {
                const label = {
                  experiments: "Experiments",
                  prompt: "Best Prompt",
                  data: "Data",
                  strategy: "Strategy",
                  errors: `Errors${errors.length > 0 ? ` (${errors.length})` : ""}`,
                }[tab]!;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: "none",
                      border: "none",
                      borderBottom:
                        activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                      color: activeTab === tab
                        ? "var(--accent)"
                        : tab === "errors" && errors.length > 0
                          ? "var(--error)"
                          : "var(--text-muted)",
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
                    {label}
                  </button>
                );
              })}
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

                {phase === "done" && !viewingHistory && (
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
                    <AccuracyChart results={results} onNodeClick={goToStrategy} />
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
                        <tr
                          key={r.exp}
                          onClick={() => r.exp > 0 && goToStrategy(r.exp)}
                          style={{
                            borderBottom: "1px solid var(--border-subtle)",
                            cursor: r.exp > 0 ? "pointer" : "default",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { if (r.exp > 0) e.currentTarget.style.background = "var(--bg-tertiary)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                        >
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

            {activeTab === "strategy" && (
              <StrategyPanel details={strategyDetails} results={results} focusedExp={focusedStrategyExp} onFocusClear={() => setFocusedStrategyExp(null)} />
            )}

            {activeTab === "errors" && (
              <ErrorsPanel errors={errors} />
            )}
          </>
        )}

        {/* History list (shown when idle) */}
        {phase === "idle" && !hasResults && (
          <div>
            {history.length > 0 ? (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                    fontWeight: 600,
                  }}
                >
                  History ({history.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map((entry) => (
                    <HistoryCard
                      key={entry.id}
                      entry={entry}
                      onView={() => {
                        viewHistory(entry);
                        setActiveTab("experiments");
                      }}
                      onDelete={() => deleteHistory(entry.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
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

// ── HistoryCard ─────────────────────────────────────────

function HistoryCard({
  entry,
  onView,
  onDelete,
}: {
  entry: HistoryEntry;
  onView: () => void;
  onDelete: () => void;
}) {
  const kept = entry.results.filter((r) => r.status === "keep").length;
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      onClick={onView}
      style={{
        ...cardBase,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
            minWidth: 52,
          }}
        >
          {(entry.bestAccuracy * 100).toFixed(1)}%
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {entry.strategyModel} &rarr; {entry.targetModel}
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-sans)",
              marginTop: 3,
            }}
          >
            {entry.numRounds} rounds &middot; {Math.max(0, kept - 1)} improvements &middot; ${entry.totalCost.toFixed(4)} &middot; {dateStr}
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 6,
          fontSize: 14,
          lineHeight: 1,
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--error)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
        }}
        title="Delete"
      >
        &#10005;
      </button>
    </div>
  );
}

// ── Diff Utilities ─────────────────────────────────────

function computeWordDiff(oldText: string, newText: string): { type: "same" | "add" | "del"; text: string }[] {
  if (oldText === newText) return [{ type: "same", text: newText }];
  const oldW = oldText.split(/(\s+)/);
  const newW = newText.split(/(\s+)/);
  const m = oldW.length, n = newW.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldW[i - 1] === newW[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const raw: { type: "same" | "add" | "del"; text: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldW[i - 1] === newW[j - 1]) { raw.unshift({ type: "same", text: oldW[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { raw.unshift({ type: "add", text: newW[j - 1] }); j--; }
    else { raw.unshift({ type: "del", text: oldW[i - 1] }); i--; }
  }
  const merged: typeof raw = [];
  for (const p of raw) {
    if (merged.length && merged[merged.length - 1].type === p.type) merged[merged.length - 1].text += p.text;
    else merged.push({ ...p });
  }
  return merged;
}

function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  if (oldText === newText) return <span style={{ color: "var(--text-secondary)" }}>{newText}</span>;
  const parts = computeWordDiff(oldText, newText);
  return (
    <span>
      {parts.map((p, i) => (
        <span key={i} style={
          p.type === "del" ? { background: "rgba(239,68,68,0.15)", color: "var(--error)", textDecoration: "line-through" }
            : p.type === "add" ? { background: "rgba(34,197,94,0.15)", color: "var(--success)" }
              : undefined
        }>{p.text}</span>
      ))}
    </span>
  );
}

function ConfigDiffView({ oldConfig, newConfig }: { oldConfig: PromptConfig; newConfig: PromptConfig }) {
  const oldSp = oldConfig?.system_prompt || "";
  const newSp = newConfig?.system_prompt || "";
  const oldFi = oldConfig?.format_instruction || "";
  const newFi = newConfig?.format_instruction || "";
  const oldFs = oldConfig?.few_shot_examples || [];
  const newFs = newConfig?.few_shot_examples || [];
  const fsChanged = JSON.stringify(oldFs) !== JSON.stringify(newFs);

  return (
    <div style={{ ...preStyle, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={diffFieldLabel}>
          system_prompt
          {oldSp !== newSp && <span style={{ color: "var(--warning)", marginLeft: 6, fontSize: 8 }}>CHANGED</span>}
        </div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
          <InlineDiff oldText={oldSp} newText={newSp} />
        </div>
      </div>

      <div>
        <div style={diffFieldLabel}>
          few_shot_examples
          {fsChanged && <span style={{ color: "var(--warning)", marginLeft: 6, fontSize: 8 }}>CHANGED</span>}
        </div>
        {!fsChanged ? (
          <div style={{ color: "var(--text-secondary)" }}>
            {newFs.length === 0 ? "[] (none)" : `${newFs.length} example(s), unchanged`}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {oldFs.filter(old => !newFs.some(n => JSON.stringify(n) === JSON.stringify(old))).map((ex, i) => (
              <div key={`d${i}`} style={{ padding: "4px 8px", borderRadius: 4, background: "rgba(239,68,68,0.08)", borderLeft: "2px solid var(--error)", fontSize: 10 }}>
                <span style={{ color: "var(--error)", textDecoration: "line-through" }}>- Q: {(ex[0] || "").slice(0, 100)}</span>
              </div>
            ))}
            {newFs.filter(n => !oldFs.some(old => JSON.stringify(old) === JSON.stringify(n))).map((ex, i) => (
              <div key={`a${i}`} style={{ padding: "4px 8px", borderRadius: 4, background: "rgba(34,197,94,0.08)", borderLeft: "2px solid var(--success)", fontSize: 10 }}>
                <span style={{ color: "var(--success)" }}>+ Q: {(ex[0] || "").slice(0, 100)}</span>
              </div>
            ))}
            {newFs.filter(n => oldFs.some(old => JSON.stringify(old) === JSON.stringify(n))).map((ex, i) => (
              <div key={`s${i}`} style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 8px" }}>
                Q: {(ex[0] || "").slice(0, 100)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={diffFieldLabel}>
          format_instruction
          {oldFi !== newFi && <span style={{ color: "var(--warning)", marginLeft: 6, fontSize: 8 }}>CHANGED</span>}
        </div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
          <InlineDiff oldText={oldFi} newText={newFi} />
        </div>
      </div>
    </div>
  );
}

const diffFieldLabel: React.CSSProperties = {
  fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-muted)",
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600,
};

function AccuracyChangeView({ exp, results }: { exp: number; results: ExperimentResult[] }) {
  const result = results.find(r => r.exp === exp);
  const prevKeeps = results.filter(r => r.exp < exp && r.status === "keep");
  const prevBest = prevKeeps.length > 0 ? Math.max(...prevKeeps.map(r => r.accuracy)) : 0;

  if (!result) return <div style={{ color: "var(--text-muted)", fontSize: 11 }}>—</div>;

  const change = result.accuracy - prevBest;

  return (
    <div style={{ ...preStyle, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
        {(prevBest * 100).toFixed(1)}%
      </span>
      <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
      <span style={{
        fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)",
        color: result.status === "keep" ? "var(--success)" : "var(--text-secondary)",
      }}>
        {(result.accuracy * 100).toFixed(1)}%
      </span>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: change > 0 ? "var(--success)" : change < 0 ? "var(--error)" : "var(--text-muted)",
      }}>
        ({change > 0 ? "+" : ""}{(change * 100).toFixed(1)}%)
      </span>
      <span style={{
        padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 600,
        background: result.status === "keep" ? "rgba(34,197,94,0.1)" : result.status === "crash" ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.08)",
        color: result.status === "keep" ? "var(--success)" : result.status === "crash" ? "var(--warning)" : "var(--error)",
      }}>
        {result.status}
      </span>
    </div>
  );
}

// ── StrategyPanel ──────────────────────────────────────

function StrategyPanel({ details, results, focusedExp, onFocusClear }: { details: StrategyDetail[]; results: ExperimentResult[]; focusedExp?: number | null; onFocusClear?: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (focusedExp != null && details.some(d => d.exp === focusedExp)) {
      setExpanded(focusedExp);
      onFocusClear?.();
      setTimeout(() => {
        document.getElementById(`strategy-exp-${focusedExp}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [focusedExp, details, onFocusClear]);

  if (details.length === 0) {
    return (
      <div style={{ ...cardBase, color: "var(--text-muted)", textAlign: "center" }}>
        {results.length > 0 ? "No strategy data (baseline only)." : "No data yet."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {details.map((d) => {
        const result = results.find((r) => r.exp === d.exp);
        const isOpen = expanded === d.exp;
        const isKeep = result?.status === "keep";

        return (
          <div
            key={d.exp}
            id={`strategy-exp-${d.exp}`}
            style={{
              ...cardBase,
              border: `1px solid ${isKeep ? "rgba(34,197,94,0.15)" : "var(--border-subtle)"}`,
              cursor: "pointer",
            }}
            onClick={() => setExpanded(isOpen ? null : d.exp)}
          >
            {/* Summary row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: 10, display: "inline-block",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s", color: "var(--text-muted)",
                }}>&#9654;</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  Exp {d.exp}
                </span>
                <span style={{
                  fontSize: 11, color: "var(--text-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {d.description}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                {result && (
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: isKeep ? "var(--success)" : "var(--text-muted)",
                  }}>
                    {(result.accuracy * 100).toFixed(1)}%
                  </span>
                )}
                <span style={{
                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                  background: isKeep ? "rgba(34,197,94,0.1)" : result?.status === "crash" ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.08)",
                  color: isKeep ? "var(--success)" : result?.status === "crash" ? "var(--warning)" : "var(--error)",
                }}>
                  {result?.status || "—"}
                </span>
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{ marginTop: 16, animation: "fadeUp 0.2s both" }}>
                {/* Config diff */}
                {d.outputConfig && d.inputConfig && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ ...sectionLabel }}>New Config</div>
                    <ConfigDiffView oldConfig={d.inputConfig} newConfig={d.outputConfig} />
                  </div>
                )}

                {/* Input: current best config */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ ...sectionLabel }}>Input Config (current best)</div>
                  <pre style={preStyle}>
                    {JSON.stringify(d.inputConfig, null, 2)}
                  </pre>
                </div>

                {/* Accuracy change */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ ...sectionLabel }}>Accuracy</div>
                  <AccuracyChangeView exp={d.exp} results={results} />
                </div>

                {/* Raw output */}
                {d.rawOutput && (
                  <div>
                    <div style={{ ...sectionLabel }}>Raw Model Output</div>
                    <pre style={preStyle}>{d.rawOutput}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
  fontWeight: 600,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: 8,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-subtle)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 300,
  overflow: "auto",
};

// ── ErrorsPanel ───────────────────────────────────────

function ErrorsPanel({ errors }: { errors: ErrorEntry[] }) {
  if (errors.length === 0) {
    return (
      <div style={{ ...cardBase, color: "var(--text-muted)", textAlign: "center" }}>
        No errors recorded.
      </div>
    );
  }

  // Group by exp
  const grouped = new Map<number, ErrorEntry[]>();
  for (const e of errors) {
    const list = grouped.get(e.exp) || [];
    list.push(e);
    grouped.set(e.exp, list);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        padding: "10px 16px", borderRadius: 10,
        background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)",
        fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--error)",
      }}>
        {errors.length} error{errors.length > 1 ? "s" : ""} across {grouped.size} round{grouped.size > 1 ? "s" : ""}
      </div>

      {Array.from(grouped.entries()).map(([exp, errs]) => (
        <div key={exp} style={{ ...cardBase }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>Exp {exp}</span>
            <span style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4,
              background: "rgba(239,68,68,0.08)", color: "var(--error)", fontWeight: 600,
            }}>
              {errs.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {errs.map((e, i) => (
              <div key={i} style={{
                padding: "8px 12px", borderRadius: 8,
                background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
                fontSize: 11, fontFamily: "var(--font-mono)", lineHeight: 1.5,
              }}>
                <div style={{ color: "var(--error)", marginBottom: 4, wordBreak: "break-word" }}>
                  {e.error}
                </div>
                {e.question && e.question !== "(task exited)" && (
                  <div style={{
                    color: "var(--text-muted)", fontSize: 10,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    Q: {e.question}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
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

function AccuracyChart({ results, onNodeClick }: { results: ExperimentResult[]; onNodeClick?: (exp: number) => void }) {
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
          style={{ cursor: p.r.exp > 0 ? "pointer" : "default" }}
          onClick={() => p.r.exp > 0 && onNodeClick?.(p.r.exp)}
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
