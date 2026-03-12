"use client";

import { useEffect, useState, useCallback } from "react";
import type { NewsData, NewsConfig, TweetData } from "@/lib/types";

const CATEGORIES = [
  { key: "claude", label: "Claude", org: "Anthropic", color: "#d4a574" },
  { key: "openai", label: "OpenAI", org: "OpenAI", color: "#10a37f" },
  { key: "gemini", label: "Gemini", org: "Google", color: "#4285f4" },
] as const;

interface NewsResponse {
  news: NewsData | null;
  config: NewsConfig;
  status: "idle" | "fetching";
  last_fetch: string | null;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsData | null>(null);
  const [config, setConfig] = useState<NewsConfig>({
    claude: [],
    openai: [],
    gemini: [],
  });
  const [status, setStatus] = useState<"idle" | "fetching">("idle");
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({
    claude: "",
    openai: "",
    gemini: "",
  });
  const [loaded, setLoaded] = useState(false);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const data: NewsResponse = await res.json();
      setNews(data.news && data.news.date ? data.news : null);
      setConfig(data.config || { claude: [], openai: [], gemini: [] });
      setStatus(data.status);
      setLastFetch(data.last_fetch);
      setConfigDraft({
        claude: (data.config?.claude || []).join(", "),
        openai: (data.config?.openai || []).join(", "),
        gemini: (data.config?.gemini || []).join(", "),
      });
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Poll while fetching
  useEffect(() => {
    if (status !== "fetching") return;
    const id = setInterval(fetchNews, 3000);
    return () => clearInterval(id);
  }, [status, fetchNews]);

  const handleRefresh = async () => {
    setStatus("fetching");
    await fetch("/api/news/refresh", { method: "POST" });
  };

  const handleSaveConfig = async () => {
    const parsed: NewsConfig = {
      claude: parseUsers(configDraft.claude),
      openai: parseUsers(configDraft.openai),
      gemini: parseUsers(configDraft.gemini),
    };
    await fetch("/api/news/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: parsed }),
    });
    setConfig(parsed);
    setShowConfig(false);
    fetchNews();
  };

  const hasAnyUsers = Object.values(config).some((u) => u.length > 0);

  return (
    <div
      className="min-h-screen relative"
      style={{ padding: "0 48px 80px", background: "var(--bg-primary)" }}
    >
      <div
        className="relative z-[1] mx-auto"
        style={{ maxWidth: 1060, animation: "fadeUp 0.6s both" }}
      >
        {/* Header */}
        <div className="drag" style={{ padding: "52px 0 0" }}>
          <div className="no-drag">
            <div className="flex items-center gap-2.5 mb-3.5">
              <div
                className="text-[10px] px-3 py-1 rounded-[5px] font-semibold uppercase tracking-wider"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--accent-bg)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                  letterSpacing: "0.08em",
                }}
              >
                Feed
              </div>
              {status === "fetching" && (
                <div
                  className="text-[10px] px-3 py-1 rounded-[5px] font-semibold uppercase tracking-wider"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "rgba(234,179,8,0.08)",
                    border: "1px solid rgba(234,179,8,0.15)",
                    color: "var(--warning)",
                    letterSpacing: "0.08em",
                  }}
                >
                  Fetching...
                </div>
              )}
            </div>

            <div className="flex items-end justify-between">
              <h1
                className="text-[52px] font-light m-0 leading-none"
                style={{
                  color: "var(--text-primary)",
                  letterSpacing: "-0.04em",
                  fontFamily: "var(--font-serif)",
                }}
              >
                News
              </h1>

              <div className="flex items-center gap-3 mb-1.5">
                {lastFetch && (
                  <span
                    className="text-[11px]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-dim)",
                    }}
                  >
                    {lastFetch}
                  </span>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={status === "fetching"}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    background: "var(--accent-bg)",
                    border: "1px solid var(--accent-border)",
                    color: "var(--accent)",
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    opacity: status === "fetching" ? 0.5 : 1,
                  }}
                >
                  {status === "fetching" ? "..." : "Refresh"}
                </button>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    background: showConfig
                      ? "var(--accent-bg)"
                      : "var(--badge-bg)",
                    border: `1px solid ${showConfig ? "var(--accent-border)" : "var(--border)"}`,
                    color: showConfig
                      ? "var(--accent)"
                      : "var(--text-muted)",
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Config
                </button>
              </div>
            </div>
          </div>

          <div className="relative" style={{ marginTop: 32, height: 1 }}>
            <div
              className="absolute left-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, var(--accent), var(--accent-border) 40%, var(--divider-end) 70%)`,
                animation:
                  "lineGrow 1.2s cubic-bezier(0.16,1,0.3,1) both",
              }}
            />
          </div>
        </div>

        {/* Config Panel */}
        {showConfig && (
          <div
            style={{
              marginTop: 24,
              padding: 24,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              animation: "fadeUp 0.3s both",
            }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-4"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
              }}
            >
              Twitter Accounts
            </div>
            <div className="flex flex-col gap-3">
              {CATEGORIES.map((cat) => (
                <div key={cat.key} className="flex items-center gap-3">
                  <div
                    className="text-xs font-medium shrink-0"
                    style={{
                      width: 80,
                      color: cat.color,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {cat.label}
                  </div>
                  <input
                    type="text"
                    value={configDraft[cat.key]}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        [cat.key]: e.target.value,
                      })
                    }
                    placeholder="e.g. AnthropicAI, claudeai"
                    className="flex-1 text-xs outline-none"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "8px 12px",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--accent-border)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border)")
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveConfig}
                className="cursor-pointer transition-all duration-200"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-text-on)",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 20px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ marginTop: 32 }}>
          {!loaded ? (
            <EmptyState text="Loading..." />
          ) : !hasAnyUsers ? (
            <EmptyState text="No Twitter accounts configured">
              <button
                onClick={() => setShowConfig(true)}
                className="cursor-pointer mt-3 transition-all duration-200"
                style={{
                  background: "var(--accent-bg)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                  borderRadius: 6,
                  padding: "6px 16px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
              >
                Configure Accounts
              </button>
            </EmptyState>
          ) : !news ? (
            <EmptyState text="No news yet">
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-dim)" }}
              >
                {status === "fetching"
                  ? "Fetching in progress..."
                  : "Click Refresh to fetch now, or wait for the 8:00 AM schedule"}
              </p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {CATEGORIES.map((cat) => {
                const catData = news.categories?.[cat.key];
                const users = config[cat.key as keyof NewsConfig] || [];
                if (users.length === 0) return null;

                return (
                  <CategoryCard
                    key={cat.key}
                    cat={cat}
                    summary={catData?.summary || ""}
                    tweets={catData?.tweets || []}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({
  cat,
  summary,
  tweets,
}: {
  cat: (typeof CATEGORIES)[number];
  summary: string;
  tweets: TweetData[];
}) {
  const okTweets = tweets.filter((t) => t.ok);

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        animation: "fadeUp 0.4s both",
      }}
    >
      {/* Category header bar */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: cat.color,
            boxShadow: `0 0 8px ${cat.color}44`,
          }}
        />
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {cat.label}
        </span>
        <span
          className="text-xs"
          style={{
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {cat.org}
        </span>
      </div>

      {/* Summary */}
      {summary && (
        <div
          style={{
            padding: "20px 24px",
            borderBottom:
              okTweets.length > 0 ? "1px solid var(--border)" : "none",
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{
              color: cat.color,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
              opacity: 0.8,
            }}
          >
            Summary
          </div>
          <p
            className="text-sm leading-relaxed m-0"
            style={{ color: "var(--text-secondary)" }}
          >
            {summary}
          </p>
        </div>
      )}

      {/* Tweets */}
      {okTweets.length > 0 && (
        <div style={{ padding: "16px 24px" }}>
          <div className="flex flex-col gap-3">
            {okTweets.map((tweet, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  background: "var(--bg-tertiary)",
                  borderRadius: 8,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: cat.color,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    @{tweet.username}
                  </span>
                  <div className="flex items-center gap-2">
                    {tweet.timestamp && (
                      <span
                        className="text-[10px]"
                        style={{
                          color: "var(--text-dim)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatTime(tweet.timestamp)}
                      </span>
                    )}
                    {tweet.url && (
                      <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] no-underline transition-opacity duration-200 hover:opacity-100"
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                          opacity: 0.6,
                        }}
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
                <p
                  className="text-xs leading-relaxed m-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {tweet.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!summary && okTweets.length === 0 && (
        <div
          className="flex items-center justify-center py-8"
          style={{ color: "var(--text-dim)" }}
        >
          <span className="text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            No data yet
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {text}
      </p>
      {children}
    </div>
  );
}

function parseUsers(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((s) => s.replace(/^@/, "").trim())
    .filter(Boolean);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${h}:${m}`;
  } catch {
    return iso;
  }
}
