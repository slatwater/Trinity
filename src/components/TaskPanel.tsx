"use client";

import { useState, useEffect, useCallback } from "react";
import { Task } from "@/lib/types";

const statusStyle: Record<string, { bg: string; color: string; label: string }> = {
  running: { bg: "rgba(99,102,241,0.15)", color: "var(--accent)", label: "Running" },
  completed: { bg: "rgba(34,197,94,0.15)", color: "var(--success)", label: "Done" },
  failed: { bg: "rgba(239,68,68,0.15)", color: "var(--error)", label: "Failed" },
  pending: { bg: "rgba(160,160,160,0.15)", color: "var(--text-secondary)", label: "Pending" },
};

export function TaskPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const deleteTask = async (taskId: string) => {
    await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    fetchTasks();
  };

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        No background tasks
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
        Background Tasks
      </h3>
      {tasks.map((task) => {
        const style = statusStyle[task.status] || statusStyle.pending;
        return (
          <div
            key={task.id}
            className="rounded-lg p-3 text-sm cursor-pointer"
            style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div className="flex items-center justify-between">
              <span className="truncate flex-1 mr-2" style={{ color: "var(--text-primary)" }}>
                {task.prompt.slice(0, 60)}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: style.bg, color: style.color }}
                >
                  {style.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                  className="text-xs opacity-40 hover:opacity-100"
                  style={{ color: "var(--error)" }}
                >
                  x
                </button>
              </div>
            </div>
            {expanded === task.id && task.result && (
              <pre
                className="mt-3 p-3 rounded text-xs overflow-auto max-h-60 whitespace-pre-wrap"
                style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
              >
                {task.result}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
