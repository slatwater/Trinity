"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("trinity-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("trinity-theme", next);
  };

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      className="relative cursor-pointer transition-all duration-300"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
        padding: 0,
      }}
    >
      {/* Track icons */}
      <span
        className="absolute"
        style={{
          left: 5, top: "50%", transform: "translateY(-50%)",
          fontSize: 11, lineHeight: 1,
          opacity: isDark ? 0.3 : 0.7,
          transition: "opacity 0.3s",
        }}
      >
        &#9788;
      </span>
      <span
        className="absolute"
        style={{
          right: 5, top: "50%", transform: "translateY(-50%)",
          fontSize: 9, lineHeight: 1,
          opacity: isDark ? 0.7 : 0.3,
          transition: "opacity 0.3s",
        }}
      >
        &#9790;
      </span>

      {/* Dot */}
      <div
        className="absolute top-1/2 rounded-full"
        style={{
          width: 16,
          height: 16,
          background: isDark ? "#666" : "#b5845a",
          transform: `translateY(-50%) translateX(${isDark ? "2px" : "22px"})`,
          transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: isDark ? "none" : "0 1px 4px rgba(181,132,90,0.3)",
        }}
      />
    </button>
  );
}
