"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Clock,
  ClipboardList,
  CheckCircle2,
  UserPlus,
  Edit2,
  X,
  Save,
  Briefcase,
  Plus,
  Trash2,
  FileText,
  CheckCircle,
  Eye,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Profile, Task, TimeEntry, Job, JobPhoto } from "@/lib/types";
import type { PayReportSubmission } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import PhotoGallery from "@/components/photos/PhotoGallery";
import LiveMapView from "@/components/LiveMapView";
import ConfirmDialog from "@/components/ConfirmDialog";

type AdminTab = "live" | "employees" | "jobs" | "payreports";

interface EmployeeWithStatus extends Profile {
  activeShift: TimeEntry | null;
  activeTasks: Task[];
  email?: string;
}


export default function AdminView() {
  const supabase = useMemo(() => createClient(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { user, profile } = useAuth();
  const [adminTab, setAdminTab] = useState<AdminTab>("live");
  const [employees, setEmployees] = useState<EmployeeWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  // ── Job photo state ───────────────────────────────────────────────────────
  const [jobPhotos, setJobPhotos] = useState<Record<string, (JobPhoto & { url: string })[]>>({});
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { uploadPhoto: uploadJobPhoto, deletePhoto: deleteJobPhoto, uploading: jobPhotoUploading, error: jobPhotoError } = usePhotoUpload("job-photos");

  // ── Pay Submissions state ─────────────────────────────────────────────────
  const [paySubmissions, setPaySubmissions] = useState<PayReportSubmission[]>([]);
  const [paySubsLoading, setPaySubsLoading] = useState(true);

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
    async function loadSubmissions() {
      setPaySubsLoading(true);
      const { data, error } = await supabase
        .from("pay_report_submissions")
        .select("*, employee:profiles!pay_report_submissions_employee_id_fkey(id, full_name)")
        .order("submitted_at", { ascending: false });
      if (!error && data) {
        setPaySubmissions(data as PayReportSubmission[]);
      }
      setPaySubsLoading(false);
    }
    loadSubmissions();
  }, [supabase]);

  const handleUpdateSubmissionStatus = useCallback(async (id: string, status: "reviewed" | "approved") => {
    const { error } = await supabase
      .from("pay_report_submissions")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
      .eq("id", id);
    if (!error) {
      setPaySubmissions((prev) =>
        prev.map((s) => s.id === id ? { ...s, status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null } : s)
      );
    }
  }, [supabase, user?.id]);

  useEffect(() => {
    loadEmployees();
    loadEmails();
    loadJobs();

    const paySubChannel = supabase
      .channel("pay-submissions-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pay_report_submissions" },
        async (payload) => {
          const { data } = await supabase
            .from("pay_report_submissions")
            .select("*, employee:profiles!pay_report_submissions_employee_id_fkey(id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setPaySubmissions((prev) => [data as PayReportSubmission, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(paySubChannel);
    };
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
  function handleDeleteJob(jobId: string) {
    setJobToDelete(jobId);
  }

  async function confirmDeleteJob() {
    if (!jobToDelete) return;
    await supabase.from("jobs").delete().eq("id", jobToDelete);
    setJobs((prev) => prev.filter((j) => j.id !== jobToDelete));
    setJobToDelete(null);
  }

  // ── Job photo fetching ────────────────────────────────────────────────────
  const fetchJobPhotos = async (jobId: string) => {
    if (jobPhotos[jobId] !== undefined) return; // already loaded
    const { data } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (data) {
      const withUrls = await Promise.all(
        data.map(async (p: JobPhoto) => {
          const { data: sd } = await supabase.storage
            .from("job-photos")
            .createSignedUrl(p.storage_path, 3600);
          return { ...p, url: sd?.signedUrl ?? "" };
        })
      );
      setJobPhotos((prev) => ({ ...prev, [jobId]: withUrls }));
    } else {
      setJobPhotos((prev) => ({ ...prev, [jobId]: [] }));
    }
  };

  const handleJobPhotoUpload = async (jobId: string, files: FileList) => {
    if (!profile) return;
    const existing = jobPhotos[jobId] ?? [];
    const remaining = 5 - existing.length;
    const toUpload = Array.from(files).slice(0, remaining);

    for (const file of toUpload) {
      const result = await uploadJobPhoto(file, profile.company_id, jobId, profile.id);
      if (!result) continue;

      const { data: inserted } = await supabase
        .from("job_photos")
        .insert({
          job_id: jobId,
          company_id: profile.company_id,
          uploader_id: profile.id,
          storage_path: result.storagePath,
          file_name: result.fileName,
          file_size: result.fileSize,
          mime_type: result.mimeType,
        })
        .select()
        .single();

      if (inserted) {
        setJobPhotos((prev) => ({
          ...prev,
          [jobId]: [...(prev[jobId] ?? []), { ...inserted, url: result.publicUrl }],
        }));
      }
    }
  };

  const handleJobPhotoDelete = async (jobId: string, photo: JobPhoto & { url: string }) => {
    const ok = await deleteJobPhoto(photo.storage_path);
    if (!ok) return;
    await supabase.from("job_photos").delete().eq("id", photo.id);
    setJobPhotos((prev) => ({
      ...prev,
      [jobId]: (prev[jobId] ?? []).filter((p) => p.id !== photo.id),
    }));
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });



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
            onClick={() => setAdminTab("payreports")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all active:scale-[0.98] ${
              adminTab === "payreports"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Pay
          </button>
        </div>
      </div>

      {/* ── LIVE VIEW ───────────────────────────────────────────────────────── */}
      {adminTab === "live" && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <LiveMapView />
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
                  className={`rounded-xl bg-white border shadow-sm overflow-hidden ${
                    job.is_active ? "border-slate-100" : "border-slate-200 opacity-60"
                  }`}
                >
                  {/* Job row header — click to expand/collapse */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer select-none"
                    onClick={() => {
                      if (expandedJobId === job.id) {
                        setExpandedJobId(null);
                      } else {
                        setExpandedJobId(job.id);
                        fetchJobPhotos(job.id);
                      }
                    }}
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
                        onClick={(e) => { e.stopPropagation(); handleToggleJob(job.id, job.is_active); }}
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                        aria-label="Delete job"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                          expandedJobId === job.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded photo gallery panel */}
                  {expandedJobId === job.id && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Photos</span>
                      </div>
                      <PhotoGallery
                        photos={jobPhotos[job.id] ?? []}
                        onUpload={(files) => handleJobPhotoUpload(job.id, files)}
                        onDelete={(photo) => handleJobPhotoDelete(job.id, photo as JobPhoto & { url: string })}
                        currentUserId={profile?.id ?? ""}
                        isAdmin={true}
                        uploading={jobPhotoUploading}
                        uploadError={jobPhotoError}
                        maxPhotos={5}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PAY REPORTS TAB ──────────────────────────────────────────────────── */}
      {adminTab === "payreports" && (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto">
          {/* Pay Submissions Section */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-500" />
                <h3 className="text-sm font-semibold text-slate-900">Pay Report Submissions</h3>
              </div>
              {paySubmissions.length > 0 && (
                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                  {paySubmissions.filter((s) => s.status === "submitted").length} pending
                </span>
              )}
            </div>

            {paySubsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              </div>
            ) : paySubmissions.length === 0 ? (
              <div className="py-10 text-center">
                <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No pay reports submitted yet</p>
                <p className="text-xs text-slate-400 mt-1">Employees can submit reports from the Time Clock tab</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {paySubmissions.map((submission) => (
                  <div key={submission.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {submission.employee?.full_name ?? "Unknown Employee"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          submission.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : submission.status === "reviewed"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(submission.period_start), "MMM d")} – {format(new Date(submission.period_end), "MMM d, yyyy")}
                        {" · "}{submission.total_hours.toFixed(2)} hrs · ${submission.gross_pay.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Submitted {format(new Date(submission.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {submission.status === "submitted" && (
                        <button
                          onClick={() => handleUpdateSubmissionStatus(submission.id, "reviewed")}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </button>
                      )}
                      {(submission.status === "submitted" || submission.status === "reviewed") && (
                        <button
                          onClick={() => handleUpdateSubmissionStatus(submission.id, "approved")}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Approve
                        </button>
                      )}
                      {submission.status === "approved" && (
                        <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Approved
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD EMPLOYEE MODAL ───────────────────────────────────────────────── */}
      {showAddEmployee && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={() => setShowAddEmployee(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Add Employee</h2>
              <button
                onClick={() => setShowAddEmployee(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
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
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Edit Employee</h2>
              <button
                onClick={() => setEditEmployee(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
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

      {jobToDelete && (
        <ConfirmDialog
          title="Delete Job"
          description="This job will be permanently deleted. Time entries linked to this job will not be affected."
          onConfirm={confirmDeleteJob}
          onCancel={() => setJobToDelete(null)}
        />
      )}
    </div>
  );
}
