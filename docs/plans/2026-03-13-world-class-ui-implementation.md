# ProTask World-Class UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add TaskDetailDrawer (click any task to fully edit it), KanbanBoard (drag-and-drop columns), and mission-control Admin Live View (split employee cards + activity feed).

**Architecture:** New components `TaskDetailDrawer` and `KanbanBoard` are self-contained and receive tasks + callbacks from `TasksView`. `AdminView` Live tab gets a split-panel rewrite with a local activity feed state populated by the existing Realtime subscription. All edits auto-save to Supabase on change.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, Supabase JS, Lucide React, HTML5 drag-and-drop (no new deps)

---

### Task 1: Add `updated_by` to Task type and `handleUpdateTask` to page.tsx

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/page.tsx`

**Step 1: Add `updated_by` to Task interface in types.ts**

In `src/lib/types.ts`, add one line to the Task interface after `updated_at`:
```typescript
  updated_by?: string | null;   // profile id of last editor
  updated_by_name?: string | null; // denormalized name for audit display
```

**Step 2: Add `handleUpdateTask` callback in page.tsx**

After `handleAddLineItem` (around line 254), add this new handler:
```typescript
  const handleUpdateTask = useCallback(
    async (taskId: string, updates: Partial<Pick<Task, "title" | "job_name" | "due_date" | "priority" | "status" | "assigned_to" | "checklist">>) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
      const { error } = await supabase
        .from("tasks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) {
        console.error("Failed to update task:", error.message);
        showToast("Failed to save changes", "error");
      }
    },
    [supabase, showToast]
  );
```

**Step 3: Pass `handleUpdateTask` and `isAdmin` into TasksView in page.tsx JSX**

Find the `<TasksView` block (~line 418) and add two props:
```tsx
          <TasksView
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDeleteTask}
            onToggleChecklist={handleToggleChecklist}
            onAddLineItem={handleAddLineItem}
            onUpdateTask={handleUpdateTask}        // NEW
            isAdmin={isAdmin}                      // NEW
            onAddTask={handleAddTask}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
          />
```

**Step 4: Verify dev server starts without errors**

Run: `npm run dev`
Expected: Compiles successfully (TypeScript errors expected until TasksView is updated in Task 6)

---

### Task 2: Create TaskDetailDrawer.tsx

**Files:**
- Create: `src/components/TaskDetailDrawer.tsx`

**Step 1: Create the full component**

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Trash2, Calendar, User, Briefcase, AlertTriangle,
  CheckCircle2, Circle, Plus, Clock, ChevronDown
} from "lucide-react";
import { Task, ChecklistItem, Profile, Job } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface TaskDetailDrawerProps {
  task: Task;
  currentUserName: string;
  isAdmin: boolean;
  onUpdate: (taskId: string, updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onClose: () => void;
}

const PRIORITY_OPTS = ["Low", "Medium", "High", "Critical"] as const;
const PRIORITY_COLORS: Record<string, string> = {
  Low: "text-slate-500 bg-slate-100",
  Medium: "text-blue-600 bg-blue-100",
  High: "text-amber-500 bg-amber-100",
  Critical: "text-red-600 bg-red-100",
};

function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct === 1 ? "#10b981" : "#f97316"} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="600"
        fill={pct === 1 ? "#10b981" : "#64748b"}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TaskDetailDrawer({
  task,
  currentUserName,
  isAdmin,
  onUpdate,
  onDelete,
  onClose,
}: TaskDetailDrawerProps) {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Pick<Profile, "id" | "full_name">[]>([]);
  const [jobs, setJobs] = useState<Pick<Job, "id" | "name">[]>([]);
  const [newItemText, setNewItemText] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [localTask, setLocalTask] = useState<Task>(task);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Keep localTask in sync with parent (Realtime updates)
  useEffect(() => { setLocalTask(task); }, [task]);

  useEffect(() => {
    async function fetchOptions() {
      const [empRes, jobRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
        supabase.from("jobs").select("id, name").eq("is_active", true).order("name"),
      ]);
      if (empRes.data) setEmployees(empRes.data);
      if (jobRes.data) setJobs(jobRes.data);
    }
    fetchOptions();
  }, [supabase]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const completedCount = localTask.checklist.filter((c) => c.completed).length;
  const pct = localTask.checklist.length > 0 ? completedCount / localTask.checklist.length : 0;

  function save(updates: Partial<Task>) {
    const merged = { ...localTask, ...updates };
    setLocalTask(merged);
    onUpdate(task.id, updates);
  }

  function handleToggleChecklist(itemId: string) {
    const updated = localTask.checklist.map((c) =>
      c.id === itemId ? { ...c, completed: !c.completed } : c
    );
    save({ checklist: updated });
  }

  function handleDeleteChecklistItem(itemId: string) {
    const updated = localTask.checklist.filter((c) => c.id !== itemId);
    save({ checklist: updated });
  }

  function handleAddItem() {
    const text = newItemText.trim();
    if (!text) return;
    const item: ChecklistItem = { id: crypto.randomUUID(), text, completed: false };
    save({ checklist: [...localTask.checklist, item] });
    setNewItemText("");
    setShowAddItem(false);
  }

  const statusColors: Record<string, string> = {
    active: "bg-slate-100 text-slate-600",
    in_progress: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
  };
  const statusLabels: Record<string, string> = {
    active: "Active",
    in_progress: "In Progress",
    completed: "Done",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: "fadeIn 0.2s ease" }}
      />

      {/* Drawer — bottom sheet on mobile, right panel on desktop */}
      <div
        className="fixed z-[160] bg-white shadow-2xl
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[92dvh] overflow-y-auto
          md:bottom-0 md:top-0 md:left-auto md:right-0 md:w-[480px] md:rounded-none md:rounded-l-2xl md:max-h-none"
        style={{ animation: "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-5 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Editable title */}
            <textarea
              ref={titleRef}
              defaultValue={localTask.title}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.title) save({ title: v });
              }}
              className="w-full resize-none text-base font-semibold text-slate-900 bg-transparent border-0 outline-none focus:ring-0 leading-snug"
              rows={2}
              style={{ minHeight: "2.5rem" }}
              placeholder="Task title..."
            />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[localTask.status]}`}>
                {statusLabels[localTask.status]}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium flex items-center gap-1 ${PRIORITY_COLORS[localTask.priority]}`}>
                {localTask.priority === "Critical" && <AlertTriangle className="h-3 w-3" />}
                {localTask.priority}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={() => { onDelete(task.id); onClose(); }}
              className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5 pb-safe pb-8">
          {/* Status action bar */}
          <div className="grid grid-cols-3 gap-2">
            {(["active", "in_progress", "completed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => save({ status: s })}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  localTask.status === s
                    ? s === "completed"
                      ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                      : s === "in_progress"
                      ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                      : "bg-slate-700 text-white border-slate-700 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {statusLabels[s]}
              </button>
            ))}
          </div>

          {/* Details grid */}
          <div className="space-y-3">
            {/* Assignee */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-24 shrink-0">
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">Assignee</span>
              </div>
              <select
                value={localTask.assigned_to ?? ""}
                onChange={(e) => save({ assigned_to: e.target.value || null })}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 bg-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>

            {/* Job */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-24 shrink-0">
                <Briefcase className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">Job</span>
              </div>
              <select
                value={localTask.job_name}
                onChange={(e) => save({ job_name: e.target.value })}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 bg-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">No job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.name}>{j.name}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-24 shrink-0">
                <AlertTriangle className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">Priority</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {PRIORITY_OPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => save({ priority: p })}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      localTask.priority === p
                        ? PRIORITY_COLORS[p] + " ring-2 ring-offset-1 ring-current"
                        : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-24 shrink-0">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">Due Date</span>
              </div>
              <input
                type="date"
                value={localTask.due_date ?? ""}
                onChange={(e) => save({ due_date: e.target.value || null })}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 bg-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">Checklist</span>
                {localTask.checklist.length > 0 && (
                  <span className="text-xs text-slate-400">
                    {completedCount}/{localTask.checklist.length}
                  </span>
                )}
              </div>
              {localTask.checklist.length > 0 && (
                <ProgressRing pct={pct} size={40} />
              )}
            </div>

            {localTask.checklist.length > 0 && (
              <div className="h-1.5 w-full rounded-full bg-slate-100 mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-400"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1">
              {localTask.checklist.map((item) => (
                <div key={item.id} className="group flex items-center gap-2 py-1.5 rounded-lg hover:bg-slate-50 px-1 -mx-1">
                  <button
                    onClick={() => handleToggleChecklist(item.id)}
                    className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      item.completed
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300 hover:border-emerald-400"
                    }`}
                  >
                    {item.completed && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${item.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => handleDeleteChecklistItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add item */}
            {showAddItem ? (
              <div className="flex gap-1.5 mt-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddItem();
                    if (e.key === "Escape") { setShowAddItem(false); setNewItemText(""); }
                  }}
                  placeholder="Add checklist item..."
                  autoFocus
                  className="flex-1 rounded-lg border border-dashed border-orange-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={handleAddItem}
                  disabled={!newItemText.trim()}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddItem(false); setNewItemText(""); }}
                  className="rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddItem(true)}
                className="mt-2 flex items-center gap-1.5 text-sm text-slate-400 hover:text-orange-600 transition-colors py-1.5 px-1"
              >
                <Plus className="h-4 w-4" />
                Add item
              </button>
            )}
          </div>

          {/* Audit footer */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Last updated {timeAgo(localTask.updated_at)}
                {localTask.updated_by_name && ` by ${localTask.updated_by_name}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors in this file (errors in TasksView are expected until Task 6)

---

### Task 3: Create KanbanBoard.tsx

**Files:**
- Create: `src/components/KanbanBoard.tsx`

**Step 1: Create the full component**

```tsx
"use client";

import { useState, useRef } from "react";
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

  const completedPct = (task: Task) => {
    if (task.checklist.length === 0) return null;
    return Math.round((task.checklist.filter((c) => c.completed).length / task.checklist.length) * 100);
  };

  const initials = (name?: string) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

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
```

---

### Task 4: Update TaskCard.tsx

**Files:**
- Modify: `src/components/TaskCard.tsx`

**Full replacement** — make the card tappable anywhere (except action buttons), add priority left border, add in_progress pulse:

```tsx
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
  onOpen: (task: Task) => void;   // NEW
}

const PRIORITY_BORDER: Record<string, string> = {
  Low: "border-l-slate-300",
  Medium: "border-l-blue-400",
  High: "border-l-amber-400",
  Critical: "border-l-red-500",
};

const PRIORITY_STYLES: Record<string, string> = {
  Low: "text-slate-500 bg-slate-100",
  Medium: "text-blue-600 bg-blue-100",
  High: "text-amber-500 bg-amber-100",
  Critical: "text-red-600 bg-red-100",
};

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const assigneeName = task.assignee?.full_name ?? "Unassigned";
  const isInProgress = task.status === "in_progress";

  return (
    <div
      className={`rounded-xl bg-white shadow-sm border border-slate-100 border-l-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer
        ${PRIORITY_BORDER[task.priority]}
        ${task.status === "completed" ? "opacity-75" : ""}
        ${isInProgress ? "ring-1 ring-blue-200" : ""}
      `}
      onClick={() => onOpen(task)}
    >
      {isInProgress && (
        <div className="h-0.5 w-full rounded-t-xl bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />
      )}

      <div className="p-4">
        {/* Top row: badges + actions */}
        <div className="mb-2 flex items-start justify-between">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {assigneeName}
            </span>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-600">
              {task.job_name}
            </span>
            {isInProgress && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-600 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                In Progress
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-1 ml-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onToggleComplete(task.id)}
              className={`p-2.5 rounded-md transition-colors ${
                task.status === "completed"
                  ? "text-emerald-500 hover:text-emerald-600"
                  : "text-slate-300 hover:text-emerald-500"
              }`}
              title={task.status === "completed" ? "Mark active" : "Mark complete"}
            >
              <CheckCircle2 className="h-6 w-6" />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-2 rounded-md text-slate-300 hover:text-red-500 transition-colors"
              title="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className={`text-base font-semibold mb-1.5 ${
          task.status === "completed" ? "line-through text-slate-400" : "text-slate-900"
        }`}>
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
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}>
            {task.priority === "Critical" && <AlertTriangle className="h-3 w-3" />}
            {task.priority}
          </span>
        </div>

        {/* Checklist */}
        <div
          className="border-t border-slate-100 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
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
                    width: `${task.checklist.length > 0 ? (completedCount / task.checklist.length) * 100 : 0}%`,
                  }}
                />
              </div>
              {task.checklist.map((item: ChecklistItem) => (
                <label key={item.id} className="flex items-center gap-2 cursor-pointer group py-1">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => onToggleChecklist(task.id, item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 accent-orange-600"
                  />
                  <span className={`text-xs transition-colors ${
                    item.completed ? "text-slate-400 line-through" : "text-slate-600 group-hover:text-slate-800"
                  }`}>
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
                  if (e.key === "Escape") { setShowAddItem(false); setNewItemText(""); }
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
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors mt-1 py-2 px-1"
            >
              <Plus className="h-3 w-3" />
              <span>Add line item</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add shimmer animation to globals.css**

In `src/app/globals.css`, add after the existing `@keyframes slideUp`:
```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

### Task 5: Update TasksView.tsx

**Files:**
- Modify: `src/components/TasksView.tsx`

**Full replacement** — add list/kanban toggle, wire drawer, pass `onOpen` to cards:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Search, ClipboardCheck, LayoutList, LayoutGrid } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";
import TaskCard from "./TaskCard";
import KanbanBoard from "./KanbanBoard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import AddTaskModal from "./AddTaskModal";
import { useAuth } from "@/contexts/AuthContext";

interface TasksViewProps {
  tasks: Task[];
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddLineItem: (taskId: string, text: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  isAdmin: boolean;
  onAddTask: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
    checklist?: ChecklistItem[];
  }) => void;
  showAddModal: boolean;
  onCloseAddModal: () => void;
}

export default function TasksView({
  tasks,
  onToggleComplete,
  onDelete,
  onToggleChecklist,
  onAddLineItem,
  onUpdateTask,
  isAdmin,
  onAddTask,
  showAddModal,
  onCloseAddModal,
}: TasksViewProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("tasksViewMode") as "list" | "kanban") ?? "list";
    }
    return "list";
  });
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const activeCount = tasks.filter((t) => t.status !== "completed").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  const filtered = tasks.filter((t) => {
    const matchesStatus = filter === "active"
      ? t.status !== "completed"
      : t.status === "completed";
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignee?.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      t.job_name.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // For kanban, show all non-archived tasks (ignore filter)
  const allActive = tasks.filter((t) =>
    search === "" ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.assignee?.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    t.job_name.toLowerCase().includes(search.toLowerCase())
  );

  function switchView(mode: "list" | "kanban") {
    setViewMode(mode);
    localStorage.setItem("tasksViewMode", mode);
  }

  function handleOpenTask(task: Task) {
    // Sync from latest tasks array in case of Realtime updates
    const latest = tasks.find((t) => t.id === task.id) ?? task;
    setOpenTask(latest);
  }

  // Keep open task in sync with tasks state (Realtime updates)
  const syncedOpenTask = openTask
    ? (tasks.find((t) => t.id === openTask.id) ?? openTask)
    : null;

  function handleUpdateStatus(taskId: string, status: "active" | "in_progress" | "completed") {
    onUpdateTask(taskId, { status });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Search + view toggle row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, people, or jobs..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        {/* View mode toggle */}
        <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0">
          <button
            onClick={() => switchView("list")}
            className={`px-3 py-2 transition-colors ${
              viewMode === "list"
                ? "bg-orange-600 text-white"
                : "text-slate-400 hover:text-slate-600"
            }`}
            title="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => switchView("kanban")}
            className={`px-3 py-2 transition-colors ${
              viewMode === "kanban"
                ? "bg-orange-600 text-white"
                : "text-slate-400 hover:text-slate-600"
            }`}
            title="Board view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status filter (list view only) */}
      {viewMode === "list" && (
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setFilter("active")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center ${
              filter === "active"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Active
            <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center ${
              filter === "completed"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Completed
            <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">
              {completedCount}
            </span>
          </button>
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <ClipboardCheck className="h-10 w-10 text-slate-300" />
              <p className="text-slate-700 font-semibold">No {filter} tasks</p>
              <p className="text-slate-400 text-sm">
                {filter === "active"
                  ? "Tap + to create your first task"
                  : "Complete some tasks to see them here"}
              </p>
            </div>
          ) : (
            filtered.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={onToggleComplete}
                onDelete={onDelete}
                onToggleChecklist={onToggleChecklist}
                onAddLineItem={onAddLineItem}
                onOpen={handleOpenTask}
              />
            ))
          )}
        </div>
      )}

      {/* Kanban view */}
      {viewMode === "kanban" && (
        <KanbanBoard
          tasks={allActive}
          onUpdateStatus={handleUpdateStatus}
          onOpenTask={handleOpenTask}
        />
      )}

      {/* Task Detail Drawer */}
      {syncedOpenTask && (
        <TaskDetailDrawer
          task={syncedOpenTask}
          currentUserName={profile?.full_name ?? ""}
          isAdmin={isAdmin}
          onUpdate={onUpdateTask}
          onDelete={onDelete}
          onClose={() => setOpenTask(null)}
        />
      )}

      {showAddModal && (
        <AddTaskModal onClose={onCloseAddModal} onAdd={onAddTask} />
      )}
    </div>
  );
}
```

---

### Task 6: Rewrite AdminView.tsx Live tab — Mission Control

**Files:**
- Modify: `src/components/AdminView.tsx`

**Step 1: Add ActivityEvent type and activity feed state**

At the top of the component (inside the function, after existing state declarations), add:

```typescript
  // Activity feed
  interface ActivityEvent {
    id: string;
    type: "completed" | "in_progress" | "edited" | "created";
    employeeName: string;
    taskTitle: string;
    jobName: string;
    timestamp: Date;
  }
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);

  // Tick for live elapsed time
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
```

**Step 2: Update the Realtime subscription to also build activity feed**

Replace the `.on("postgres_changes", { event: "*", table: "tasks" }, ...)` handler with:

```typescript
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        async (payload) => {
          loadEmployees();
          // Build activity event
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const newData = payload.new as Task;
            // Find employee name
            const emp = employees.find((e) => e.id === newData.assigned_to);
            const empName = emp?.full_name ?? "Someone";
            let type: ActivityEvent["type"] = "edited";
            if (payload.eventType === "INSERT") type = "created";
            else if (newData.status === "completed") type = "completed";
            else if (newData.status === "in_progress") type = "in_progress";

            const event: ActivityEvent = {
              id: crypto.randomUUID(),
              type,
              employeeName: empName,
              taskTitle: newData.title,
              jobName: newData.job_name,
              timestamp: new Date(),
            };
            setActivityFeed((prev) => [event, ...prev].slice(0, 50));
          }
        }
      )
```

**Step 3: Replace the Live tab JSX with the mission control layout**

Replace the entire `{adminTab === "live" && ( ... )}` block with this:

```tsx
      {adminTab === "live" && (
        <div className="flex flex-col gap-3">
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-emerald-600">{clocked.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Clocked In</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-slate-600">{notClocked.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Off / Away</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-blue-600">
                {employees.reduce((s, e) => s + e.activeTasks.filter(t => t.status === "in_progress").length, 0)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">In Progress</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-orange-600">
                {employees.reduce((s, e) => s + e.activeTasks.length, 0)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Open Tasks</p>
            </div>
          </div>

          {/* Mission control: split layout */}
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Left: employee cards (58%) */}
            <div className="flex flex-col gap-2 lg:flex-[58]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Team Status</h3>
                <button
                  onClick={loadEmployees}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              {isLoading ? (
                <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
              ) : (
                employees
                  .filter((e) => e.is_active)
                  .map((emp) => {
                    const inProgressTask = emp.activeTasks.find(t => t.status === "in_progress");
                    const currentTask = inProgressTask ?? emp.activeTasks[0] ?? null;
                    const checklistPct = currentTask && currentTask.checklist.length > 0
                      ? currentTask.checklist.filter(c => c.completed).length / currentTask.checklist.length
                      : null;
                    const elapsedMins = emp.activeShift
                      ? Math.floor((Date.now() - new Date(emp.activeShift.clock_in).getTime()) / 60000)
                      : null;
                    const elapsedStr = elapsedMins !== null
                      ? elapsedMins >= 60
                        ? `${Math.floor(elapsedMins / 60)}h ${elapsedMins % 60}m`
                        : `${elapsedMins}m`
                      : null;
                    const initials = emp.full_name
                      ? emp.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                      : "?";

                    const r = 16;
                    const circ = 2 * Math.PI * r;
                    const pct = checklistPct ?? 0;

                    return (
                      <div
                        key={emp.id}
                        className={`rounded-xl p-4 border shadow-sm transition-all ${
                          emp.activeShift
                            ? "bg-white border-emerald-200 shadow-emerald-50"
                            : "bg-white border-slate-100"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                            emp.activeShift ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-slate-900">{emp.full_name}</span>
                              <div className={`h-2 w-2 rounded-full shrink-0 ${
                                emp.activeShift ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                              }`} />
                              {emp.activeShift && elapsedStr && (
                                <span className="text-xs font-medium text-emerald-600">{elapsedStr}</span>
                              )}
                            </div>

                            {emp.activeShift ? (
                              <p className="text-xs text-slate-500 mb-2">
                                <span className="font-medium text-emerald-700">{emp.activeShift.job_name}</span>
                                {" · "}since {formatTime(emp.activeShift.clock_in)}
                                {" · "}${emp.hourly_rate}/hr
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400 mb-2">Not clocked in</p>
                            )}

                            {/* Current task highlight */}
                            {currentTask ? (
                              <div className={`rounded-lg px-3 py-2 flex items-center gap-3 ${
                                inProgressTask
                                  ? "bg-blue-50 border border-blue-200"
                                  : "bg-orange-50 border border-orange-200"
                              }`}>
                                {checklistPct !== null && (
                                  <svg width="36" height="36" className="shrink-0">
                                    <circle cx="18" cy="18" r={r} fill="none" stroke="#f1f5f9" strokeWidth="3" />
                                    <circle cx="18" cy="18" r={r} fill="none"
                                      stroke={pct === 1 ? "#10b981" : inProgressTask ? "#3b82f6" : "#f97316"}
                                      strokeWidth="3"
                                      strokeDasharray={circ}
                                      strokeDashoffset={circ * (1 - pct)}
                                      strokeLinecap="round"
                                      transform="rotate(-90 18 18)"
                                      style={{ transition: "stroke-dashoffset 0.4s ease" }}
                                    />
                                    <text x="18" y="22" textAnchor="middle" fontSize="9" fontWeight="700"
                                      fill={inProgressTask ? "#3b82f6" : "#f97316"}>
                                      {Math.round(pct * 100)}%
                                    </text>
                                  </svg>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-semibold truncate ${
                                    inProgressTask ? "text-blue-800" : "text-orange-800"
                                  }`}>
                                    {currentTask.title}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    {inProgressTask ? "In Progress" : "Assigned"}
                                    {currentTask.checklist.length > 0 && (
                                      <span> · {currentTask.checklist.filter(c=>c.completed).length}/{currentTask.checklist.length} items</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            ) : emp.activeShift ? (
                              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                <p className="text-xs font-medium text-amber-700">No active task assigned</p>
                              </div>
                            ) : null}

                            {/* Extra tasks count */}
                            {emp.activeTasks.length > 1 && (
                              <p className="text-[10px] text-slate-400 mt-1.5">
                                +{emp.activeTasks.length - 1} more task{emp.activeTasks.length - 1 !== 1 ? "s" : ""} assigned
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Right: activity feed (42%) */}
            <div className="flex flex-col gap-2 lg:flex-[42]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-700">Live Activity</h3>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                {activityFeed.length === 0 ? (
                  <div className="py-10 flex flex-col items-center gap-2 text-center px-4">
                    <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No activity yet</p>
                    <p className="text-xs text-slate-400">Task updates will appear here in real time</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
                    {activityFeed.map((event) => {
                      const colors: Record<string, string> = {
                        completed: "bg-emerald-500",
                        in_progress: "bg-blue-500",
                        edited: "bg-orange-400",
                        created: "bg-slate-400",
                      };
                      const labels: Record<string, string> = {
                        completed: "completed",
                        in_progress: "started",
                        edited: "updated",
                        created: "created",
                      };
                      return (
                        <div key={event.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                          <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${colors[event.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700 leading-snug">
                              <span className="font-semibold">{event.employeeName}</span>
                              {" "}{labels[event.type]}{" "}
                              <span className="font-medium text-slate-900">&ldquo;{event.taskTitle}&rdquo;</span>
                              {event.jobName && (
                                <span className="text-slate-400"> on {event.jobName}</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {event.timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
```

**Step 4: Add missing imports to AdminView.tsx**

Add `Clock` to the import from lucide-react at the top.

---

### Task 7: Final verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: 0 errors

**Step 3: Manual smoke test checklist**
- [ ] Click any task card → TaskDetailDrawer opens
- [ ] Edit title in drawer → saves on blur
- [ ] Change assignee/job/priority/due date → saves immediately
- [ ] Toggle checklist items in drawer → updates progress ring
- [ ] Click Active / In Progress / Done status buttons → updates card in list
- [ ] Toggle to Board view → kanban renders 3 columns
- [ ] Drag a card to a different column → status updates
- [ ] Tap any kanban card → TaskDetailDrawer opens
- [ ] Admin tab → Live view shows split layout
- [ ] Make a task change → appears in activity feed

**Step 5: Commit**

```bash
git add src/lib/types.ts src/app/page.tsx src/components/TaskDetailDrawer.tsx src/components/KanbanBoard.tsx src/components/TaskCard.tsx src/components/TasksView.tsx src/components/AdminView.tsx src/app/globals.css
git commit -m "feat: task detail drawer, kanban board, mission control admin live view"
```
