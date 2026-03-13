"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
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
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !jobName.trim() || !dueDate) return;
    onAdd({
      title: title.trim(),
      job_name: jobName.trim(),
      due_date: dueDate,
      priority,
      assigned_to: assignedTo || null,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 animate-[slideUp_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">New Task</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="e.g. Install kitchen cabinets"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                {addEmpError && (
                  <p className="text-xs text-red-600">{addEmpError}</p>
                )}
                <input
                  type="text"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                <input
                  type="email"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={newEmpPassword}
                  onChange={(e) => setNewEmpPassword(e.target.value)}
                  placeholder="Password (min 6 chars)"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                <input
                  type="number"
                  value={newEmpRate}
                  onChange={(e) => setNewEmpRate(e.target.value)}
                  placeholder="Hourly rate"
                  min="0"
                  step="0.5"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddEmployee}
                    disabled={addingEmployee || !newEmpName.trim() || !newEmpEmail.trim() || !newEmpPassword}
                    className="flex-1 rounded-md bg-orange-600 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {addingEmployee ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewEmployee(false); setAddEmpError(null); }}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required={!showNewJob}
            >
              <option value="">— Select a Job —</option>
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
                  className="flex-1 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddJob}
                  disabled={addingJob || !newJobName.trim()}
                  className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {addingJob ? "…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewJob(false)}
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "Low" | "Medium" | "High" | "Critical")
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-orange-700 active:scale-[0.98]"
          >
            Add Task
          </button>
        </form>
      </div>
    </div>
  );
}
