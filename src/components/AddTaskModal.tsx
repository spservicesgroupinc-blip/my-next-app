"use client";

import { useState, useEffect } from "react";
import { X, Plus, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, ChecklistItem } from "@/lib/types";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
    checklist: ChecklistItem[];
  }) => void;
  initialDate?: string;
}

export default function AddTaskModal({ onClose, onAdd, initialDate }: AddTaskModalProps) {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Pick<Profile, "id" | "full_name">[]>([]);
  const [jobNames, setJobNames] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [jobName, setJobName] = useState("");
  const [dueDate, setDueDate] = useState(initialDate || "");
  // UI uses 3 levels; maps to DB values: Normal→Medium, High→High, Urgent→Critical
  const [priorityUI, setPriorityUI] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [showDetails, setShowDetails] = useState(!!initialDate);

  // Line items (checklist)
  const [lineItems, setLineItems] = useState<ChecklistItem[]>([]);
  const [newLineItem, setNewLineItem] = useState("");

  // Inline add-new states
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [newEmpRate, setNewEmpRate] = useState("0");
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [addEmpError, setAddEmpError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("jobs")
        .select("name")
        .eq("is_active", true)
        .order("name"),
    ]).then(([profilesRes, jobsRes]) => {
      if (profilesRes.data) setEmployees(profilesRes.data);
      const names = (jobsRes.data ?? []).map((j: { name: string }) => j.name);
      setJobNames(names);
      if (names.length > 0 && !jobName) setJobName(names[0]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddJob() {
    if (!newJobName.trim()) return;
    setAddingJob(true);
    const { error } = await supabase
      .from("jobs")
      .insert({ name: newJobName.trim(), is_active: true });
    if (!error) {
      setJobNames((prev) => [...prev, newJobName.trim()].sort());
      setJobName(newJobName.trim());
      setNewJobName("");
      setShowNewJob(false);
    }
    setAddingJob(false);
  }

  async function handleAddEmployee() {
    if (!newEmpName.trim() || !newEmpEmail.trim() || !newEmpPassword) return;
    setAddingEmployee(true);
    setAddEmpError(null);
    const res = await fetch("/api/admin/invite-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmpEmail.trim(),
        password: newEmpPassword,
        full_name: newEmpName.trim(),
        hourly_rate: parseFloat(newEmpRate) || 0,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setAddEmpError(json.error ?? "Failed to create employee");
      setAddingEmployee(false);
      return;
    }
    // Refresh employees list and select the new one
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name");
    if (data) {
      setEmployees(data);
      const created = data.find((e) => e.full_name === newEmpName.trim());
      if (created) setAssignedTo(created.id);
    }
    setNewEmpName("");
    setNewEmpEmail("");
    setNewEmpPassword("");
    setNewEmpRate("0");
    setShowNewEmployee(false);
    setAddingEmployee(false);
  }

  const addLineItem = () => {
    if (!newLineItem.trim()) return;
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: newLineItem.trim(), completed: false },
    ]);
    setNewLineItem("");
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const priorityToDB = (ui: "Normal" | "High" | "Urgent"): "Low" | "Medium" | "High" | "Critical" => {
    if (ui === "High") return "High";
    if (ui === "Urgent") return "Critical";
    return "Medium";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      job_name: jobName.trim() || "General",
      due_date: dueDate || new Date().toISOString().split("T")[0],
      priority: priorityToDB(priorityUI),
      assigned_to: assignedTo || null,
      checklist: lineItems,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-8 animate-[slideUp_0.3s_ease-out] max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">New Task</h2>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Title - REQUIRED */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Task Name <span className="text-slate-400 font-normal">(required)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
              placeholder="e.g. Install kitchen cabinets"
              autoFocus
              required
            />
          </div>

          {/* Line Items / Checklist */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Line Items <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            {lineItems.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {lineItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <div className="h-4 w-4 rounded border border-slate-300 shrink-0" />
                    <span className="flex-1 text-sm text-slate-700 truncate">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      className="flex h-8 w-8 items-center justify-center p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newLineItem}
                onChange={(e) => setNewLineItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLineItem();
                  }
                }}
                className="flex-1 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
                placeholder="Add a line item..."
              />
              <button
                type="button"
                onClick={addLineItem}
                disabled={!newLineItem.trim()}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-orange-100 hover:text-orange-600 disabled:opacity-30 transition-all active:scale-95"
                aria-label="Add line item"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Priority — always visible, 3 simple options */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Priority</label>
            <div className="flex gap-2">
              {(["Normal", "High", "Urgent"] as const).map((p) => {
                const styles = {
                  Normal: { active: "bg-slate-800 text-white", inactive: "bg-slate-100 text-slate-500" },
                  High: { active: "bg-amber-500 text-white", inactive: "bg-slate-100 text-slate-500" },
                  Urgent: { active: "bg-red-500 text-white", inactive: "bg-slate-100 text-slate-500" },
                };
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriorityUI(p)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-[0.97] ${
                      priorityUI === p ? styles[p].active : styles[p].inactive
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Details Toggle */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-orange-600 transition-colors w-full border-t border-slate-100 pt-3 mt-1 active:scale-[0.98]"
          >
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDetails ? "Hide details" : "Add details (assign, job, date)"}
          </button>

          {showDetails && (<>
          {/* Assign To */}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assign To
            </label>
            <select
              value={assignedTo}
              onChange={(e) => {
                if (e.target.value === "__ADD_NEW__") {
                  setShowNewEmployee(true);
                  setAssignedTo("");
                } else {
                  setAssignedTo(e.target.value);
                  setShowNewEmployee(false);
                }
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
            >
              <option value="">— Unassigned —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
              <option value="__ADD_NEW__" className="font-semibold">＋ Add Employee…</option>
            </select>

            {showNewEmployee && (
              <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700 mb-1">Quick Add Employee</p>
                {addEmpError && (
                  <p className="text-xs text-red-600 font-medium">{addEmpError}</p>
                )}
                <input
                  type="text"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="email"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="password"
                  value={newEmpPassword}
                  onChange={(e) => setNewEmpPassword(e.target.value)}
                  placeholder="Password (min 6 chars)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="number"
                  value={newEmpRate}
                  onChange={(e) => setNewEmpRate(e.target.value)}
                  placeholder="Hourly rate"
                  min="0"
                  step="0.5"
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddEmployee}
                    disabled={addingEmployee || !newEmpName.trim() || !newEmpEmail.trim() || !newEmpPassword}
                    className="flex-1 rounded-lg bg-orange-600 py-2.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {addingEmployee ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewEmployee(false); setAddEmpError(null); }}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Job / Project
            </label>
            <select
              value={jobName}
              onChange={(e) => {
                if (e.target.value === "__ADD_NEW__") {
                  setShowNewJob(true);
                  setJobName("");
                } else {
                  setJobName(e.target.value);
                  setShowNewJob(false);
                }
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
            >
              <option value="">— Select a Job (optional) —</option>
              {jobNames.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
              <option value="__ADD_NEW__" className="font-semibold">＋ Add New Job…</option>
            </select>

            {showNewJob && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  placeholder="New job name"
                  className="flex-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddJob}
                  disabled={addingJob || !newJobName.trim()}
                  className="rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {addingJob ? "…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewJob(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors active:scale-[0.98]"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
            />
          </div>
          </>)}

          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-orange-600/20 transition-all hover:shadow-lg hover:shadow-orange-600/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <CheckCircle2 className="h-5 w-5" />
            Create Task
          </button>
        </form>
      </div>
    </div>
  );
}
