"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Clock,
  ClipboardList,
  CheckCircle2,
  UserPlus,
  Edit2,
  X,
  Save,
  RefreshCw,
  Briefcase,
  Plus,
  Trash2,
  MapPin,
  Activity,
  UserCheck,
  CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, Task, TimeEntry, Job } from "@/lib/types";
import LiveMapView from "@/components/LiveMapView";

type AdminTab = "live" | "employees" | "jobs" | "map";

interface EmployeeWithStatus extends Profile {
  activeShift: TimeEntry | null;
  activeTasks: Task[];
  email?: string;
}

interface ActivityEvent {
  id: string;
  type: "clock_in" | "clock_out" | "task_insert" | "task_update" | "task_delete" | "message";
  employeeName: string;
  taskTitle?: string;
  jobName?: string;
  timestamp: string;
}

// ── Progress Ring Component ───────────────────────────────────────────────────
function ProgressRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={pct === 1 ? "#10b981" : "#f97316"} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
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


export default function AdminView() {
  const supabase = createClient();
  const [adminTab, setAdminTab] = useState<AdminTab>("live");
  const [employees, setEmployees] = useState<EmployeeWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // ── Activity feed state ───────────────────────────────────────────────────
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([]);
  const elapsedTimes = useRef<Record<string, string>>({});
  const [, setTick] = useState(0);

  // ── Add Employee modal state ─────────────────────────────────────────────
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRate, setNewRate] = useState("0");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // ── Edit Employee modal state ─────────────────────────────────────────────
  const [editEmployee, setEditEmployee] = useState<EmployeeWithStatus | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "employee">("employee");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Employee email map ────────────────────────────────────────────────────
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});

  // ── Jobs state ────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);

    const [profilesRes, shiftsRes, tasksRes] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase
        .from("time_entries")
        .select("*")
        .is("clock_out", null),
      supabase
        .from("tasks")
        .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
        .neq("status", "completed"),
    ]);

    const profiles: Profile[] = profilesRes.data ?? [];
    const activeShifts: TimeEntry[] = shiftsRes.data ?? [];
    const activeTasks: Task[] = tasksRes.data ?? [];

    const enriched: EmployeeWithStatus[] = profiles.map((p) => ({
      ...p,
      activeShift: activeShifts.find((s) => s.user_id === p.id) ?? null,
      activeTasks: activeTasks.filter((t) => t.assigned_to === p.id),
    }));

    setEmployees(enriched);
    setIsLoading(false);
  }, [supabase]);

  const loadEmails = useCallback(async () => {
    const res = await fetch("/api/admin/employees");
    if (res.ok) {
      const json = await res.json();
      setEmailMap(json.emailMap ?? {});
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .order("name");
    setJobs(data ?? []);
    setJobsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadEmployees();
    loadEmails();
    loadJobs();

    // Tick every second to update elapsed times
    const tickInterval = setInterval(() => setTick((t) => t + 1), 1000);

    // Real-time: refresh when time_entries change
    const sub = supabase
      .channel("admin-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "time_entries" },
        async (payload) => {
          loadEmployees();
          // Add to activity feed
          const emp = employees.find((e) => e.id === (payload.new as any).user_id);
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "clock_in",
              employeeName: emp?.full_name ?? "Unknown",
              jobName: (payload.new as any).job_name,
              timestamp: new Date().toISOString(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "time_entries" },
        () => {
          loadEmployees();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        async (payload) => {
          loadEmployees();
          const emp = employees.find((e) => e.id === (payload.new as any).created_by);
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "task_insert",
              employeeName: emp?.full_name ?? "Unknown",
              taskTitle: (payload.new as any).title,
              jobName: (payload.new as any).job_name,
              timestamp: new Date().toISOString(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        async (payload) => {
          loadEmployees();
          const emp = employees.find((e) => e.id === (payload.new as any).updated_by);
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "task_update",
              employeeName: emp?.full_name ?? "Unknown",
              taskTitle: (payload.new as any).title,
              timestamp: new Date().toISOString(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => loadJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
      clearInterval(tickInterval);
    };
  }, [loadEmployees, loadEmails, loadJobs, supabase, employees]);

  // ── Invite new employee ───────────────────────────────────────────────────
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

    if (!res.ok) {
      setAddError(json.error ?? "Failed to invite employee");
      setAddLoading(false);
      return;
    }

    setShowAddEmployee(false);
    setNewEmail("");
    setNewName("");
    setNewPassword("");
    setNewRate("0");
    setAddLoading(false);
    await loadEmployees();
  }

  // ── Open employee edit modal ──────────────────────────────────────────────
  function openEditEmployee(emp: EmployeeWithStatus) {
    setEditEmployee(emp);
    setEditName(emp.full_name);
    setEditRate(String(emp.hourly_rate));
    setEditRole(emp.role);
    setEditError(null);
  }

  // ── Save employee edits ───────────────────────────────────────────────────
  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmployee) return;
    setEditSaving(true);
    setEditError(null);

    const rate = parseFloat(editRate);
    if (isNaN(rate) || rate < 0) {
      setEditError("Invalid hourly rate");
      setEditSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName.trim(),
        hourly_rate: rate,
        role: editRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editEmployee.id);

    if (error) {
      setEditError(error.message);
      setEditSaving(false);
      return;
    }

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === editEmployee.id
          ? { ...e, full_name: editName.trim(), hourly_rate: rate, role: editRole }
          : e
      )
    );
    setEditEmployee(null);
    setEditSaving(false);
  }

  // ── Toggle active/inactive ────────────────────────────────────────────────
  async function handleToggleActive(profileId: string, current: boolean) {
    await supabase
      .from("profiles")
      .update({ is_active: !current, updated_at: new Date().toISOString() })
      .eq("id", profileId);

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === profileId ? { ...e, is_active: !current } : e
      )
    );
  }

  // ── Add job ───────────────────────────────────────────────────────────────
  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!newJobName.trim()) return;
    setAddingJob(true);

    const { error } = await supabase
      .from("jobs")
      .insert({ name: newJobName.trim(), is_active: true });

    if (!error) {
      setNewJobName("");
      await loadJobs();
    }
    setAddingJob(false);
  }

  // ── Toggle job active state ───────────────────────────────────────────────
  async function handleToggleJob(jobId: string, current: boolean) {
    await supabase
      .from("jobs")
      .update({ is_active: !current })
      .eq("id", jobId);

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, is_active: !current } : j))
    );
  }

  // ── Delete job ────────────────────────────────────────────────────────────
  async function handleDeleteJob(jobId: string) {
    await supabase.from("jobs").delete().eq("id", jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  const calcHours = (clockIn: string) => {
    const ms = Date.now() - new Date(clockIn).getTime();
    return (ms / (1000 * 60 * 60)).toFixed(1);
  };

  const formatElapsed = (clockIn: string) => {
    const ms = Date.now() - new Date(clockIn).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const clocked = employees.filter((e) => e.activeShift !== null);
  const notClocked = employees.filter((e) => e.activeShift === null && e.is_active);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col">
      {/* Admin tab toggle */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white p-4">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setAdminTab("live")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              adminTab === "live"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Live View
          </button>
          <button
            onClick={() => setAdminTab("employees")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              adminTab === "employees"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Employees
          </button>
          <button
            onClick={() => setAdminTab("jobs")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              adminTab === "jobs"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            Jobs
          </button>
          <button
            onClick={() => setAdminTab("map")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              adminTab === "map"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Map
          </button>
        </div>
      </div>

      {/* ── LIVE VIEW ───────────────────────────────────────────────────────── */}
      {adminTab === "live" && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
          {/* Employee status column */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2 flex-shrink-0">
              <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-emerald-600">{clocked.length}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Clocked In</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-slate-700">{notClocked.length}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Off / Away</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-100 p-3 text-center shadow-sm">
                <p className="text-lg font-bold text-orange-600">
                  {employees.reduce((s, e) => s + e.activeTasks.length, 0)}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Open Tasks</p>
              </div>
            </div>

            <div className="flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-semibold text-slate-700">All Employees</h3>
              <button
                onClick={loadEmployees}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
            ) : (
              <div className="flex flex-col gap-2">
                {employees
                  .filter((e) => e.is_active)
                  .map((emp) => (
                    <div
                      key={emp.id}
                      className={`rounded-xl p-3 border shadow-sm ${
                        emp.activeShift
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-white border-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${
                              emp.activeShift
                                ? "bg-emerald-500 animate-pulse"
                                : "bg-slate-300"
                            }`}
                          />
                          <span className="text-sm font-semibold text-slate-900">
                            {emp.full_name || "Unnamed"}
                          </span>
                          <span className="text-xs text-slate-400">
                            ${emp.hourly_rate}/hr
                          </span>
                        </div>
                        {emp.activeShift && (
                          <span className="text-xs font-medium text-emerald-600">
                            {calcHours(emp.activeShift.clock_in)}h
                          </span>
                        )}
                      </div>

                      {emp.activeShift ? (
                        <p className="text-xs text-emerald-700 ml-4">
                          <span className="font-medium">{emp.activeShift.job_name}</span>
                          {" "}· since {formatTime(emp.activeShift.clock_in)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 ml-4">Not clocked in</p>
                      )}

                      {emp.activeTasks.length > 0 && (
                        <div className="mt-2 ml-4 flex flex-wrap gap-1">
                          {emp.activeTasks.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
                            >
                              <ClipboardList className="h-2.5 w-2.5" />
                              {t.title.length > 24
                                ? t.title.slice(0, 24) + "…"
                                : t.title}
                            </span>
                          ))}
                          {emp.activeTasks.length > 3 && (
                            <span className="text-[10px] text-slate-400">
                              +{emp.activeTasks.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
          
          {/* Activity feed column */}
          <div className="flex flex-col gap-3 rounded-xl bg-white p-4 border border-slate-100 shadow-sm overflow-y-auto">
             <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity Feed
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Activity className="h-12 w-12 text-slate-200" />
              <p className="mt-4 font-semibold text-slate-700">Real-time Activity</p>
              <p className="mt-1 text-xs text-slate-400">
                Clock-ins, task updates, and messages will appear here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── EMPLOYEES TAB ───────────────────────────────────────────────────── */}
      {adminTab === "employees" && (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Team ({employees.length})
            </h3>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Employee
            </button>
          </div>

          {employees.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => openEditEmployee(emp)}
              className={`rounded-xl bg-white border p-3 shadow-sm text-left w-full transition-colors hover:border-orange-300 ${
                emp.is_active ? "border-slate-100" : "border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {emp.full_name || "Unnamed"}
                    {!emp.is_active && (
                      <span className="ml-2 text-[10px] font-medium text-slate-400 uppercase">
                        Inactive
                      </span>
                    )}
                    {emp.role === "admin" && (
                      <span className="ml-2 text-[10px] font-medium text-orange-600 uppercase">
                        Admin
                      </span>
                    )}
                  </p>
                  {emailMap[emp.id] && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {emailMap[emp.id]}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    ${emp.hourly_rate}/hr · {emp.activeTasks.length} open task
                    {emp.activeTasks.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Edit2 className="h-4 w-4 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── JOBS TAB ─────────────────────────────────────────────────────────── */}
      {adminTab === "jobs" && (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Jobs ({jobs.filter((j) => j.is_active).length} active)
            </h3>
          </div>

          {/* Add job form */}
          <form onSubmit={handleAddJob} className="flex gap-2">
            <input
              type="text"
              value={newJobName}
              onChange={(e) => setNewJobName(e.target.value)}
              placeholder="New job name..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
            <button
              type="submit"
              disabled={addingJob}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>

          {jobsLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No jobs yet. Add one above.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`flex items-center justify-between rounded-xl bg-white border p-3 shadow-sm ${
                    job.is_active ? "border-slate-100" : "border-slate-200 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className={`h-4 w-4 ${job.is_active ? "text-orange-500" : "text-slate-300"}`} />
                    <span className="text-sm font-medium text-slate-900">{job.name}</span>
                    {!job.is_active && (
                      <span className="text-[10px] font-medium text-slate-400 uppercase">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleJob(job.id, job.is_active)}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                        job.is_active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {job.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAP VIEW ────────────────────────────────────────────────────────── */}
      {adminTab === "map" && <LiveMapView />}

      {/* ── ADD EMPLOYEE MODAL ───────────────────────────────────────────────── */}
      {showAddEmployee && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={() => setShowAddEmployee(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Add Employee</h2>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="e.g. Mike Johnson"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="mike@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  min="0"
                  step="0.5"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <button
                type="submit"
                disabled={addLoading}
                className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-orange-700 disabled:opacity-60"
              >
                {addLoading ? "Creating…" : "Create Employee"}
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-slate-400">
              Employee can log in immediately with the email and password you set.
            </p>
          </div>
        </div>
      )}

      {/* ── EDIT EMPLOYEE MODAL ──────────────────────────────────────────────── */}
      {editEmployee && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={() => setEditEmployee(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Edit Employee</h2>
              <button
                onClick={() => setEditEmployee(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {editError}
              </div>
            )}

            {emailMap[editEmployee.id] && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500 mb-0.5">Login Email</p>
                <p className="text-sm text-slate-900">{emailMap[editEmployee.id]}</p>
              </div>
            )}

            <form onSubmit={handleSaveEmployee} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  min="0"
                  step="0.5"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as "admin" | "employee")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Active / Inactive toggle */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="text-sm text-slate-700">Active Status</span>
                <button
                  type="button"
                  onClick={() => {
                    handleToggleActive(editEmployee.id, editEmployee.is_active);
                    setEditEmployee({
                      ...editEmployee,
                      is_active: !editEmployee.is_active,
                    });
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    editEmployee.is_active
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {editEmployee.is_active ? "Active" : "Inactive"}
                </button>
              </div>

              {/* Task summary */}
              <div className="rounded-lg border border-slate-200 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500 mb-1">Current Tasks</p>
                {editEmployee.activeTasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No open tasks</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {editEmployee.activeTasks.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
                      >
                        <ClipboardList className="h-2.5 w-2.5" />
                        {t.title.length > 30 ? t.title.slice(0, 30) + "…" : t.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {editEmployee.activeShift && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-emerald-700">
                    Currently clocked in: {editEmployee.activeShift.job_name} · since{" "}
                    {formatTime(editEmployee.activeShift.clock_in)}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={editSaving}
                className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-orange-700 disabled:opacity-60"
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
