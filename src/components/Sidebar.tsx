"use client";

import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  key: string;
  label: string;
  path: string;
  matchPaths: string[];
  icon: React.ReactNode;
};

const MAIN_NAV: NavItem[] = [
  {
    key: "code",
    label: "Code",
    path: "/",
    matchPaths: ["/", "/project"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    key: "evolvelab",
    label: "EvolveLab",
    path: "/evolvelab",
    matchPaths: ["/evolvelab"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6v7l4 7H5l4-7V3z" />
        <path d="M9 3h6" />
        <circle cx="12" cy="17" r="1" />
        <circle cx="10" cy="15" r="0.5" />
        <circle cx="14.5" cy="15.5" r="0.5" />
      </svg>
    ),
  },
];

const UTIL_NAV: NavItem[] = [
  {
    key: "news",
    label: "News",
    path: "/news",
    matchPaths: ["/news"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
        <path d="M21 12a9 9 0 0 0-9-9" />
        <path d="M21 12a5 5 0 0 0-5-5" />
        <circle cx="21" cy="12" r="1" />
        <path d="M17 20V6" />
      </svg>
    ),
  },
  {
    key: "config",
    label: "Config",
    path: "/config",
    matchPaths: ["/config"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative"
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        border: "none",
        background: active ? "var(--accent-bg)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        gap: 3,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--badge-bg-hover)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}
    >
      {active && (
        <div
          style={{
            position: "absolute",
            left: -8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 20,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
      {item.icon}
      <span
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          fontWeight: active ? 600 : 400,
          letterSpacing: "0.03em",
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (item: NavItem) =>
    item.matchPaths.some((p) =>
      p === "/" ? pathname === "/" : pathname.startsWith(p)
    );

  return (
    <aside
      className="shrink-0 flex flex-col items-center"
      style={{
        width: 68,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-subtle)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Drag region */}
      <div className="drag w-full" style={{ height: 52 }} />

      {/* Spacer top */}
      <div className="flex-1" />

      {/* All nav items — centered */}
      <nav className="flex flex-col items-center gap-1 no-drag">
        {[...MAIN_NAV, ...UTIL_NAV].map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={isActive(item)}
            onClick={() => router.push(item.path)}
          />
        ))}
      </nav>

      {/* Spacer bottom */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <div className="no-drag" style={{ paddingBottom: 16 }}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
