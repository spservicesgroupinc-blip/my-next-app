"use client";

import { CheckCircle2, Trash2, CalendarDays, ChevronRight } from "lucide-react";
import { Task } from "@/lib/types";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onOpen: (task: Task) => void;
}

const priorityBorder: Record<string, string> = {
  Low: "border-l-slate-200",
  Medium: "border-l-slate-200",
  High: "border-l-amber-400",
  Critical: "border-l-red-500",
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function TaskCard({ task, onToggleComplete, onDelete, onOpen }: TaskCardProps) {
  const completedCount = task.checklist.filter((c) => c.completed).length;
  const isCompleted = task.status === "completed";

  const assigneeName = task.assignee?.full_name ?? "Unassigned";
  const assigneeInitials = assigneeName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusConfig = {
    active: { label: "Active", color: "bg-slate-100 text-slate-500" },
    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
    completed: { label: "Done", color: "bg-emerald-100 text-emerald-700" },
  };

  const urgentBadge =
    task.priority === "Critical"
      ? { label: "Urgent", color: "bg-red-100 text-red-600" }
      : task.priority === "High"
      ? { label: "High", color: "bg-amber-100 text-amber-600" }
      : null;

  return (
    <div
      onClick={() => onOpen(task)}
      className={`relative rounded-xl bg-white p-3.5 shadow-sm border border-slate-100
        transition-all duration-200 cursor-pointer active:scale-[0.98]
        border-l-4 ${priorityBorder[task.priority]}
        ${isCompleted ? "opacity-50 bg-slate-50" : "hover:shadow-md"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              statusConfig[task.status].color
            }`}
          >
            {statusConfig[task.status].label}
          </span>
          {urgentBadge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgentBadge.color}`}>
              {urgentBadge.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(task.id);
            }}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-90 ${
              isCompleted
                ? "text-emerald-500 bg-emerald-50"
                : "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50"
            }`}
            aria-label={isCompleted ? "Mark active" : "Mark complete"}
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90"
            aria-label="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <ChevronRight className="h-4 w-4 text-slate-300 mr-0.5" />
        </div>
      </div>

      {/* Title */}
      <h3
        className={`text-base font-semibold mb-2.5 leading-snug ${
          isCompleted ? "line-through text-slate-400" : "text-slate-900"
        }`}
      >
        {task.title}
      </h3>

      {/* Meta row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {task.due_date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>

        {task.checklist.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(completedCount / task.checklist.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">
              {completedCount}/{task.checklist.length}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-600 shrink-0">
          {assigneeInitials}
        </div>
        <span className="text-[11px] text-slate-500 truncate">{assigneeName}</span>
        {task.job_name && task.job_name !== "General" && (
          <>
            <span className="text-[11px] text-slate-300 shrink-0">•</span>
            <span className="text-[11px] text-slate-500 truncate">{task.job_name}</span>
          </>
        )}
      </div>
    </div>
  );
}
