"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Save, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface EmployeeRow extends Profile {
  email?: string;
}

export default function EmployeeManagementTab() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "employee">("employee");
  const [editSaving, setEditSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRate, setNewRate] = useState("0");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, emailRes] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      fetch("/api/admin/employees"),
    ]);
    const emailJson = emailRes.ok ? await emailRes.json() : { emailMap: {} };
    const emailMap: Record<string, string> = emailJson.emailMap ?? {};
    setEmployees(
      (profilesRes.data ?? []).map((p: Profile) => ({ ...p, email: emailMap[p.id] }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(emp: EmployeeRow) {
    setEditId(emp.id);
    setEditName(emp.full_name);
    setEditRate(String(emp.hourly_rate));
    setEditRole(emp.role);
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName.trim(),
        hourly_rate: parseFloat(editRate) || 0,
        role: editRole,
      })
      .eq("id", editId);
    setEditSaving(false);
    if (!error) {
      setEditId(null);
      load();
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    const res = await fetch("/api/admin/invite-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newEmail.trim(),
        password: newPassword,
        full_name: newName.trim(),
        hourly_rate: parseFloat(newRate) || 0,
      }),
    });
    const json = await res.json();
    setAddLoading(false);
    if (!res.ok) {
      setAddError(json.error ?? "Failed to add employee");
    } else {
      setShowAdd(false);
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRate("0");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Team Members</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Invite
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {employees.map((emp) => (
              <li key={emp.id} className="px-5 py-4">
                {editId === emp.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Name
                        </label>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Hourly Rate ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Role
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as "admin" | "employee")
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      >
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-white">
                        {emp.full_name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {emp.full_name}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{emp.email ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          emp.role === "admin"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {emp.role}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        ${emp.hourly_rate}/hr
                      </span>
                      <button
                        onClick={() => openEdit(emp)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Invite Employee</h3>
            <form onSubmit={handleAddEmployee} className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              <input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              <input
                type="password"
                placeholder="Temporary Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Hourly Rate"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
                >
                  {addLoading ? "Inviting…" : "Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
