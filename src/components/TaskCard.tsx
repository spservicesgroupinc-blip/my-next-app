"use client";

import { useState } from "react";
import { CheckCircle2, Trash2, CalendarDays, AlertTriangle, Plus } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddLineItem: (taskId: string, text: string) => void;
}

export default function TaskCard({
  task,
  onToggleComplete,
  onDelete,
  onToggleChecklist,
  onAddLineItem,
}: TaskCardProps) {
  const [newItemText, setNewItemText] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const completedCount = task.checklist.filter((c) => c.completed).length;

  const priorityStyles: Record<string, string> = {
    Low: "text-slate-500 bg-slate-100",
    Medium: "text-blue-600 bg-blue-100",
    High: "text-amber-500 bg-amber-100",
    Critical: "text-red-600 bg-red-100",
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const assigneeName = task.assignee?.full_name ?? "Unassigned";

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
      {/* Top row: badges + actions */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {assigneeName}
          </span>
          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-600">
            {task.job_name}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={() => onToggleComplete(task.id)}
            className={`p-1 rounded-md transition-colors ${
              task.status === "completed"
                ? "text-emerald-500 hover:text-emerald-600"
                : "text-slate-300 hover:text-emerald-500"
            }`}
            title={task.status === "completed" ? "Mark active" : "Mark complete"}
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded-md text-slate-300 hover:text-red-500 transition-colors"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3
        className={`text-sm font-semibold mb-1.5 ${
          task.status === "completed"
            ? "line-through text-slate-400"
            : "text-slate-900"
        }`}
      >
        {task.title}
      </h3>

      {/* Meta row */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        {task.due_date && (
          <span className="flex items-center gap-1 text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(task.due_date)}
          </span>
        )}
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            priorityStyles[task.priority]
          }`}
        >
          {task.priority === "Critical" && <AlertTriangle className="h-3 w-3" />}
          {task.priority}
        </span>
      </div>

      {/* Checklist / Line Items */}
      <div className="border-t border-slate-100 pt-2.5">
        {task.checklist.length > 0 && (
          <div className="space-y-1.5 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Line Items
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                {completedCount}/{task.checklist.length}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden mb-1">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${
                    task.checklist.length > 0
                      ? (completedCount / task.checklist.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            {task.checklist.map((item: ChecklistItem) => (
              <label
                key={item.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => onToggleChecklist(task.id, item.id)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 accent-orange-600"
                />
                <span
                  className={`text-xs transition-colors ${
                    item.completed
                      ? "text-slate-400 line-through"
                      : "text-slate-600 group-hover:text-slate-800"
                  }`}
                >
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Add line item */}
        {showAddItem ? (
          <div className="flex gap-1.5 mt-1">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItemText.trim()) {
                  onAddLineItem(task.id, newItemText.trim());
                  setNewItemText("");
                }
                if (e.key === "Escape") {
                  setShowAddItem(false);
                  setNewItemText("");
                }
              }}
              placeholder="New line item..."
              autoFocus
              className="flex-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={() => {
                if (newItemText.trim()) {
                  onAddLineItem(task.id, newItemText.trim());
                  setNewItemText("");
                }
              }}
              disabled={!newItemText.trim()}
              className="rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddItem(false); setNewItemText(""); }}
              className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors mt-1"
          >
            <Plus className="h-3 w-3" />
            <span>Add line item</span>
          </button>
        )}
      </div>
    </div>
  );
}
