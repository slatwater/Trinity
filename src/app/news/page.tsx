"use client";

export default function NewsPage() {
  return (
    <div className="min-h-screen relative" style={{ padding: "0 48px 80px" }}>
      <div
        className="relative z-[1] mx-auto"
        style={{ maxWidth: 1060, animation: "fadeUp 0.6s both" }}
      >
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
            </div>
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
          </div>

          <div className="relative" style={{ marginTop: 32, height: 1 }}>
            <div
              className="absolute left-0 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, var(--accent), var(--accent-border) 40%, var(--divider-end) 70%)`,
                animation: "lineGrow 1.2s cubic-bezier(0.16,1,0.3,1) both",
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              News feed coming soon
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
              Updates, changelogs, and announcements
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
