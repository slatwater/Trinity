"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  filePath: string;
  displayName: string;
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}

export function ConfigEditor({ filePath, displayName, initialContent, onClose, onSave }: Props) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, content]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const lineCount = content.split("\n").length;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(content);
    } catch (e: unknown) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: "backdropIn 0.3s both" }}
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        style={{ background: "var(--overlay-bg)", backdropFilter: "var(--overlay-blur)" }}
      />
      <div
        className="relative w-full max-w-3xl flex flex-col"
        style={{
          maxHeight: "85vh",
          background: "var(--modal-bg)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          boxShadow: "var(--modal-shadow)",
          animation: "modalIn 0.45s 0.1s both cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent line */}
        <div
          className="absolute top-0"
          style={{ left: 32, right: 32, height: 1, background: "linear-gradient(90deg, transparent, var(--modal-accent-line), transparent)" }}
        />

        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-sm font-medium truncate"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-serif)" }}
            >
              {displayName}
            </span>
            <span
              className="text-[10px] shrink-0"
              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
            >
              {filePath}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className="text-[10px]"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            >
              {lineCount} lines
            </span>
            <button
              onClick={onClose}
              className="text-[10px] px-2 py-0.5 rounded-md transition-opacity hover:opacity-70"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ESC
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden" style={{ padding: "0" }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="w-full h-full resize-none outline-none"
            style={{
              minHeight: 300,
              maxHeight: "calc(85vh - 130px)",
              padding: "20px 24px",
              background: "transparent",
              color: "var(--ai-bubble-color)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.7,
              border: "none",
              tabSize: 2,
            }}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "12px 24px", borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-[11px]" style={{ color: "var(--error)", fontFamily: "var(--font-mono)" }}>
                {error}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {"\u2318"}S to save
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="cursor-pointer text-xs transition-colors duration-200"
              style={{
                padding: "7px 18px",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="cursor-pointer text-xs font-semibold transition-all duration-200"
              style={{
                padding: "7px 22px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                color: "var(--accent-text-on)",
                border: "none",
                borderRadius: 8,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
