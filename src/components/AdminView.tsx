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
  DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, Task, TimeEntry, Job } from "@/lib/types";
import LiveMapView from "@/components/LiveMapView";
import dynamic from "next/dynamic";
const PayrollTab = dynamic(() => import("@/components/payroll/PayrollTab"), { ssr: false });

type AdminTab = "live" | "employees" | "jobs" | "map" | "payroll";

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
  const employeesRef = useRef<EmployeeWithStatus[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
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
    employeesRef.current = enriched;
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

    // Real-time: watch time_entries, tasks, jobs, employee_locations
    const sub = supabase
      .channel("admin-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "time_entries" },
        async (payload) => {
          await loadEmployees();
          const emp = employeesRef.current.find(
            (e) => e.id === (payload.new as any).user_id
          );
          let employeeName: string = emp?.full_name ?? "";
          if (!employeeName) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", (payload.new as any).user_id)
              .single();
            employeeName = prof?.full_name ?? "Unknown";
          }
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "clock_in",
              employeeName,
              jobName: (payload.new as any).job_name,
              timestamp: new Date().toISOString(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "time_entries" },
        async (payload) => {
          await loadEmployees();
          const entry = payload.new as any;
          if (entry.clock_out) {
            const emp = employeesRef.current.find((e) => e.id === entry.user_id);
            let employeeName: string = emp?.full_name ?? "";
            if (!employeeName) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", entry.user_id)
                .single();
              employeeName = prof?.full_name ?? "Unknown";
            }
            setActivityFeed((prev) => [
              {
                id: crypto.randomUUID(),
                type: "clock_out",
                employeeName,
                jobName: entry.job_name,
                timestamp: new Date().toISOString(),
              },
              ...prev.slice(0, 49),
            ]);
          }
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
          await loadEmployees();
          const emp = employeesRef.current.find(
            (e) => e.id === (payload.new as any).created_by
          );
          let employeeName: string = emp?.full_name ?? "";
          if (!employeeName) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", (payload.new as any).created_by)
              .single();
            employeeName = prof?.full_name ?? "Unknown";
          }
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "task_insert",
              employeeName,
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
          await loadEmployees();
          const emp = employeesRef.current.find(
            (e) => e.id === (payload.new as any).updated_by
          );
          let employeeName: string = emp?.full_name ?? "";
          if (!employeeName && (payload.new as any).updated_by) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", (payload.new as any).updated_by)
              .single();
            employeeName = prof?.full_name ?? "Unknown";
          }
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "task_update",
              employeeName: employeeName ?? "Someone",
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnectionStatus("disconnected");
        else setConnectionStatus("connecting");
      });

    return () => {
      supabase.removeChannel(sub);
      clearInterval(tickInterval);
    };
    // Do NOT include `employees` in deps — use employeesRef.current inside handlers
  }, [loadEmployees, loadEmails, loadJobs, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="flex h-full flex-col">
      {/* Admin tab toggle */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white p-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setAdminTab("live")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
              adminTab === "live"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Live
          </button>
          <button
            onClick={() => setAdminTab("employees")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
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
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
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
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
              adminTab === "map"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Map
          </button>
          <button
            onClick={() => setAdminTab("payroll")}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-semibold rounded-xl transition-all ${
              adminTab === "payroll"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <DollarSign className="h-4 w-4" />
            Payroll
          </button>
        </div>
      </div>

      {/* ── LIVE VIEW ───────────────────────────────────────────────────────── */}
      {adminTab === "live" && (
        <div className="flex flex-col gap-4 overflow-hidden p-4 flex-1 min-h-0">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 mb-3">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-slate-500 font-medium">
              {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
            </span>
          </div>
          {/* Summary row - 4 stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">{clocked.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center justify-center gap-1">
                <UserCheck className="h-3 w-3" /> Clocked In
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-slate-700">{notClocked.length}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Off / Away</p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-blue-600">
                {employees.reduce((s, e) => s + (e.activeShift ? 1 : 0), 0)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center justify-center gap-1">
                <CircleDot className="h-3 w-3" /> Active
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-orange-600">
                {employees.reduce((s, e) => s + e.activeTasks.length, 0)}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center justify-center gap-1">
                <ClipboardList className="h-3 w-3" /> Tasks
              </p>
            </div>
          </div>

          {/* Split layout - Employee cards + Activity feed */}
          <div className="flex flex-col lg:flex-row gap-4 overflow-hidden flex-1 min-h-0">
            {/* Left: Employee cards (58%) */}
            <div className="flex flex-col gap-3 overflow-y-auto lg:w-[58%]">
              <div className="flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-slate-700">Employee Status</h3>
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
                  {employees.filter((e) => e.is_active).map((emp) => {
                    const elapsed = emp.activeShift ? formatElapsed(emp.activeShift.clock_in) : "";
                    const topTask = emp.activeTasks[0];
                    const taskProgress = topTask
                      ? topTask.checklist.length > 0
                        ? topTask.checklist.filter((c) => c.completed).length / topTask.checklist.length
                        : 0
                      : null;

                    return (
                      <div
                        key={emp.id}
                        className={`rounded-2xl p-3.5 border shadow-sm transition-all hover:shadow-md ${
                          emp.activeShift
                            ? "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200"
                            : "bg-white border-slate-100"
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {/* Avatar initials */}
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-50 text-orange-600 text-xs font-bold shrink-0 shadow-sm">
                              {emp.full_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-900">
                                  {emp.full_name || "Unnamed"}
                                </span>
                                {emp.activeShift && (
                                  <span className="flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-medium">${emp.hourly_rate}/hr</span>
                                {emp.activeShift && (
                                  <>
                                    <span>•</span>
                                    <span className="text-emerald-600 font-mono">{elapsed}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Job info */}
                        {emp.activeShift ? (
                          <div className="mb-2 ml-12">
                            <p className="text-xs text-emerald-700 font-medium">
                              {emp.activeShift.job_name}
                              <span className="text-emerald-600 ml-1">· since {formatTime(emp.activeShift.clock_in)}</span>
                            </p>
                          </div>
                        ) : (
                          <div className="ml-12">
                            <p className="text-xs text-slate-400">Not clocked in</p>
                          </div>
                        )}

                        {/* Current task highlight */}
                        {topTask ? (
                          <div className="mt-2 ml-12 rounded-xl bg-white border border-slate-100 p-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700 truncate">
                                  {topTask.title}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {topTask.job_name}
                                </p>
                              </div>
                              {taskProgress !== null && (
                                <ProgressRing pct={taskProgress} size={36} />
                              )}
                            </div>
                            {emp.activeTasks.length > 1 && (
                              <p className="text-[10px] text-slate-400 mt-1.5">
                                +{emp.activeTasks.length - 1} more task
                                {emp.activeTasks.length - 1 !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        ) : emp.activeShift ? (
                          <div className="mt-2 ml-12 rounded-xl bg-amber-50 border border-amber-200 p-2.5">
                            <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                              <CircleDot className="h-3.5 w-3.5" />
                              No active task assigned
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Activity feed (42%) */}
            <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 border border-slate-100 shadow-sm overflow-y-auto lg:w-[42%]">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Activity className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-semibold text-slate-700">Activity Feed</h3>
                <span className="flex items-center gap-1 ml-auto text-[10px] font-medium text-emerald-600">
                  <span className="flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {activityFeed.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 mb-3">
                      <Activity className="h-7 w-7 text-slate-300" />
                    </div>
                    <p className="font-semibold text-slate-700">No Activity Yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Clock-ins, task updates will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0">
                    {activityFeed.map((event, idx) => {
                      const iconMap = {
                        clock_in: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
                        clock_out: <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />,
                        task_insert: <ClipboardList className="h-3.5 w-3.5 text-blue-500" />,
                        task_update: <RefreshCw className="h-3.5 w-3.5 text-amber-500" />,
                        task_delete: <Trash2 className="h-3.5 w-3.5 text-red-400" />,
                        message: <Activity className="h-3.5 w-3.5 text-purple-500" />,
                      };
                      const timeAgo = (ts: string) => {
                        const diff = Date.now() - new Date(ts).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return "just now";
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        return `${Math.floor(hrs / 24)}d ago`;
                      };

                      return (
                        <div
                          key={event.id}
                          className={`flex items-start gap-3 py-2.5 ${
                            idx < activityFeed.length - 1 ? "border-b border-slate-50" : ""
                          }`}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50">
                            {iconMap[event.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-700">
                              <span className="font-medium text-slate-900">{event.employeeName}</span>
                              {event.type === "clock_in" && " clocked in"}
                              {event.type === "clock_out" && " clocked out"}
                              {event.type === "task_insert" && " created task"}
                              {event.type === "task_update" && " updated task"}
                              {event.type === "task_delete" && " deleted task"}
                              {event.taskTitle && (
                                <span className="text-slate-500">: {event.taskTitle}</span>
                              )}
                              {event.jobName && (
                                <span className="text-slate-400"> — {event.jobName}</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(event.timestamp)}</p>
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

      {/* ── PAYROLL TAB ─────────────────────────────────────────────────────── */}
      {adminTab === "payroll" && <PayrollTab />}

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
