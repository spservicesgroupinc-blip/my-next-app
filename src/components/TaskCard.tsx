"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Trash2,
  CalendarDays,
  AlertTriangle,
  ChevronRight,
  Save,
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
  const [justSaved, setJustSaved] = useState(false);
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

  const handleToggleChecklistWithFeedback = (itemId: string) => {
    onToggleChecklist(task.id, itemId);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1000);
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
        
        {/* Action buttons - always visible for touch accessibility */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-90 ${
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
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90"
            aria-label="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center text-slate-300">
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
        
        {/* Checklist progress - mobile-friendly size */}
        {task.checklist.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(completedCount / task.checklist.length) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500">
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

      {/* Inline checklist - show first 2 items only, no inline editing */}
      {task.checklist.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100">
          <div className="space-y-1.5">
            {task.checklist.slice(0, 2).map((item: ChecklistItem) => (
              <label
                key={item.id}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 cursor-pointer py-1 min-h-[36px]"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggleChecklistWithFeedback(item.id)}
                  className="h-5 w-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 accent-orange-600 shrink-0"
                />
                <span
                  className={`text-sm transition-colors ${
                    item.completed
                      ? "text-slate-400 line-through"
                      : "text-slate-600"
                  }`}
                >
                  {item.text}
                </span>
              </label>
            ))}
            {task.checklist.length > 2 && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpen(task); }}
                className="text-sm text-slate-400 hover:text-orange-600 transition-colors py-1 min-h-[36px]"
              >
                +{task.checklist.length - 2} more items
              </button>
            )}
          </div>

        </div>
      )}

      {/* Save confirmation indicator */}
      {justSaved && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500 text-white px-2 py-1 rounded-md text-xs font-medium shadow-sm animate-fade-in-out">
          <Save className="h-3 w-3" />
          <span>Saved</span>
        </div>
      )}
    </div>
  );
}
