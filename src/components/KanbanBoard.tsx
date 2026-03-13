"use client";

import { useState } from "react";
import { Task } from "@/lib/types";

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateStatus: (taskId: string, status: "active" | "in_progress" | "completed") => void;
  onOpenTask: (task: Task) => void;
}

type ColStatus = "active" | "in_progress" | "completed";

const COLUMNS: { status: ColStatus; label: string; color: string; bg: string; dot: string }[] = [
  { status: "active",      label: "Active",      color: "text-slate-700",  bg: "bg-slate-50  border-slate-200", dot: "bg-slate-400" },
  { status: "in_progress", label: "In Progress", color: "text-blue-700",   bg: "bg-blue-50   border-blue-200",  dot: "bg-blue-500 animate-pulse" },
  { status: "completed",   label: "Done",        color: "text-emerald-700",bg: "bg-emerald-50 border-emerald-200",dot: "bg-emerald-500" },
];

const PRIORITY_BORDER: Record<string, string> = {
  Low: "border-l-slate-300",
  Medium: "border-l-blue-400",
  High: "border-l-amber-400",
  Critical: "border-l-red-500",
};

export default function KanbanBoard({ tasks, onUpdateStatus, onOpenTask }: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColStatus | null>(null);

  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggedId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, col: ColStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function handleDrop(e: React.DragEvent, col: ColStatus) {
    e.preventDefault();
    if (draggedId) {
      const task = tasks.find((t) => t.id === draggedId);
      if (task && task.status !== col) {
        onUpdateStatus(draggedId, col);
      }
    }
    setDraggedId(null);
    setDragOverCol(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverCol(null);
  }

  function completedPct(task: Task): number | null {
    if (task.checklist.length === 0) return null;
    return Math.round((task.checklist.filter((c) => c.completed).length / task.checklist.length) * 100);
  }

  function initials(name?: string): string {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-1 -mx-1" style={{ minHeight: "60vh" }}>
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        const isOver = dragOverCol === col.status;

        return (
          <div
            key={col.status}
            className={`flex flex-col rounded-xl border min-w-[260px] flex-1 transition-all ${col.bg} ${
              isOver ? "ring-2 ring-orange-400 ring-offset-1" : ""
            }`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDrop={(e) => handleDrop(e, col.status)}
            onDragLeave={() => setDragOverCol(null)}
          >
            {/* Column header */}
            <div className="px-3 py-2.5 flex items-center gap-2 border-b border-inherit">
              <div className={`h-2 w-2 rounded-full ${col.dot}`} />
              <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                {col.label}
              </span>
              <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-slate-200">
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 flex-1">
              {colTasks.length === 0 ? (
                <div className={`flex-1 flex items-center justify-center rounded-lg border-2 border-dashed ${
                  isOver ? "border-orange-400 bg-orange-50/50" : "border-transparent"
                } min-h-[80px] transition-all`}>
                  {isOver && (
                    <span className="text-xs font-medium text-orange-500">Drop here</span>
                  )}
                </div>
              ) : (
                colTasks.map((task) => {
                  const pct = completedPct(task);
                  const isDragging = draggedId === task.id;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onOpenTask(task)}
                      className={`rounded-lg bg-white border-l-4 border border-slate-100 p-3 shadow-sm cursor-pointer
                        hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all select-none
                        ${PRIORITY_BORDER[task.priority]}
                        ${isDragging ? "opacity-40 scale-95" : "opacity-100"}`}
                    >
                      <p className={`text-sm font-medium leading-snug mb-2 ${
                        task.status === "completed" ? "line-through text-slate-400" : "text-slate-800"
                      }`}>
                        {task.title}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {task.assignee?.full_name && (
                            <div className="h-5 w-5 rounded-full bg-orange-100 text-orange-600 text-[9px] font-bold flex items-center justify-center shrink-0">
                              {initials(task.assignee.full_name)}
                            </div>
                          )}
                          {task.job_name && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                              {task.job_name}
                            </span>
                          )}
                        </div>

                        {pct !== null && (
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-12 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400">{pct}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Drop zone overlay when dragging over non-empty column */}
              {isOver && colTasks.length > 0 && (
                <div className="rounded-lg border-2 border-dashed border-orange-400 bg-orange-50/30 h-12 flex items-center justify-center">
                  <span className="text-xs font-medium text-orange-500">Drop here</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
