"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Trash2,
  CalendarDays,
  AlertTriangle,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddLineItem: (taskId: string, text: string) => void;
  onOpen: (task: Task) => void;
}

export default function TaskCard({
  task,
  onToggleComplete,
  onDelete,
  onToggleChecklist,
  onAddLineItem,
  onOpen,
}: TaskCardProps) {
  const [newItemText, setNewItemText] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const completedCount = task.checklist.filter((c) => c.completed).length;

  const priorityBorderStyles: Record<string, string> = {
    Low: "border-l-slate-300",
    Medium: "border-l-blue-500",
    High: "border-l-amber-500",
    Critical: "border-l-red-500",
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const assigneeName = task.assignee?.full_name ?? "Unassigned";
  const assigneeInitials = assigneeName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleCardClick = () => {
    onOpen(task);
  };

  const isCompleted = task.status === "completed";

  const statusConfig = {
    active: { label: "Active", color: "bg-slate-100 text-slate-600" },
    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
    completed: { label: "Done", color: "bg-emerald-100 text-emerald-700" },
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-xl bg-white p-3.5 shadow-sm border border-slate-100 
        transition-all duration-200 cursor-pointer active:scale-[0.98]
        border-l-4 ${priorityBorderStyles[task.priority]}
        ${isCompleted ? "opacity-50 bg-slate-50" : "hover:shadow-md hover:border-l-orange-500"}`}
    >
      {/* Header: status + actions */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            statusConfig[task.status as keyof typeof statusConfig].color
          }`}>
            {statusConfig[task.status as keyof typeof statusConfig].label}
          </span>
          {task.priority === "Critical" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" /> Critical
            </span>
          )}
        </div>
        
        {/* Action buttons - visible on hover/tap */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-90 ${
              isCompleted
                ? "text-emerald-500 bg-emerald-50 hover:bg-emerald-100"
                : "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50"
            }`}
            aria-label={isCompleted ? "Mark active" : "Mark complete"}
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90"
            aria-label="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center text-slate-300">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Title - primary focus */}
      <h3 className={`text-base font-semibold mb-2 ${
        isCompleted ? "line-through text-slate-400" : "text-slate-900"
      }`}>
        {task.title}
      </h3>

      {/* Compact meta row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {task.due_date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
        
        {/* Checklist progress - compact */}
        {task.checklist.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(completedCount / task.checklist.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {completedCount}/{task.checklist.length}
            </span>
          </div>
        )}
      </div>

      {/* Footer: assignee + job */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-600 shrink-0">
          {assigneeInitials}
        </div>
        <span className="text-[11px] text-slate-500 truncate">{assigneeName}</span>
        <span className="text-[11px] text-slate-300 shrink-0">•</span>
        <span className="text-[11px] text-slate-500 truncate">{task.job_name}</span>
      </div>

      {/* Inline checklist - only show if items exist or adding */}
      {(task.checklist.length > 0 || showAddItem) && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100">
          {task.checklist.length > 0 && !showAddItem && (
            <div className="space-y-1.5">
              {task.checklist.slice(0, 3).map((item: ChecklistItem) => (
                <label
                  key={item.id}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 cursor-pointer group py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => onToggleChecklist(task.id, item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 accent-orange-600"
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
              {task.checklist.length > 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpen(task); }}
                  className="text-xs text-slate-400 hover:text-orange-600 transition-colors"
                >
                  +{task.checklist.length - 3} more items
                </button>
              )}
            </div>
          )}

          {/* Add line item inline */}
          {showAddItem ? (
            <div onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
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
                className="flex-1 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <button
                onClick={() => {
                  if (newItemText.trim()) {
                    onAddLineItem(task.id, newItemText.trim());
                    setNewItemText("");
                  }
                }}
                disabled={!newItemText.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-40 transition-colors active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setShowAddItem(false); setNewItemText(""); }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors active:scale-95"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddItem(true); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors mt-1 py-1.5 px-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add line item</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
