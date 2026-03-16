"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Trash2, Calendar, User, Briefcase, AlertTriangle,
  Plus, Clock, CheckCircle2, Save, Download
} from "lucide-react";
import { Task, ChecklistItem, Profile, Job } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import ProgressRing from "@/components/ProgressRing";

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Keep localTask in sync with parent (Realtime updates)
  useEffect(() => { setLocalTask(task); setHasUnsavedChanges(false); }, [task]);

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

  // Deep compare checklist to detect unsaved changes
  function checklistsEqual(a: ChecklistItem[], b: ChecklistItem[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, i) => 
      item.id === b[i].id && item.text === b[i].text && item.completed === b[i].completed
    );
  }

  function save(updates: Partial<Task>) {
    const merged = { ...localTask, ...updates };
    setLocalTask(merged);
    onUpdate(task.id, updates);
  }

  function handleManualSave() {
    // Force a sync to Supabase by re-sending current localTask state
    const updates: Partial<Task> = {};
    if (localTask.title !== task.title) updates.title = localTask.title;
    if (localTask.assigned_to !== task.assigned_to) updates.assigned_to = localTask.assigned_to;
    if (localTask.job_name !== task.job_name) updates.job_name = localTask.job_name;
    if (localTask.priority !== task.priority) updates.priority = localTask.priority;
    if (localTask.due_date !== task.due_date) updates.due_date = localTask.due_date;
    if (localTask.status !== task.status) updates.status = localTask.status;
    if (!checklistsEqual(localTask.checklist, task.checklist)) {
      updates.checklist = localTask.checklist;
    }
    
    if (Object.keys(updates).length > 0) {
      setIsSaving(true);
      onUpdate(task.id, updates);
      setTimeout(() => setIsSaving(false), 500);
    }
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

  const statusOpts = [
    { value: "active" as const, label: "Active", icon: null },
    { value: "in_progress" as const, label: "In Progress", icon: null },
    { value: "completed" as const, label: "Done", icon: CheckCircle2 },
  ] as const;

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
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[80dvh] overflow-y-auto
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
              onClick={handleManualSave}
              disabled={isSaving}
              className={`p-2 rounded-lg transition-colors ${
                isSaving
                  ? "bg-orange-100 text-orange-600"
                  : "text-slate-400 hover:text-orange-600 hover:bg-orange-50"
              }`}
              aria-label="Save changes"
              title="Save changes to Supabase"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              onClick={() => { onDelete(task.id); onClose(); }}
              className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5 pb-safe pb-8">
          {/* Compact Segmented Control for Status */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
            {statusOpts.map((opt) => {
              const isActive = localTask.status === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => save({ status: opt.value })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                    isActive
                      ? opt.value === "completed"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : opt.value === "in_progress"
                        ? "bg-blue-500 text-white shadow-sm"
                        : "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{opt.label}</span>
                  <span className="sm:hidden">
                    {opt.label === "In Progress" ? "Progress" : opt.label}
                  </span>
                </button>
              );
            })}
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
                    className="p-1.5 text-slate-300 hover:text-red-400 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Remove checklist item"
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
                  aria-label="Cancel"
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
