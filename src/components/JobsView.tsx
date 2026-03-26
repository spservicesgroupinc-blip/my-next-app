"use client";

import { useState, useEffect } from "react";
import { Briefcase, Plus, Trash2, Edit2, CheckCircle2, XCircle, DollarSign, Clock } from "lucide-react";
import { Job, TimeEntry } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/ConfirmDialog";

interface JobsViewProps {
  onClose: () => void;
  onSelectJob: (jobName: string) => void;
  autoOpenAdd?: boolean;
}

export default function JobsView({ onClose, onSelectJob, autoOpenAdd }: JobsViewProps) {
  const supabase = createClient();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddJob, setShowAddJob] = useState(autoOpenAdd ?? false);
  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);
  const [addJobError, setAddJobError] = useState("");
  const [jobTimeEntries, setJobTimeEntries] = useState<Record<string, TimeEntry[]>>({});
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setJobs(data as Job[]);
      
      // Fetch time entries for each job
      const timeData: Record<string, TimeEntry[]> = {};
      await Promise.all(
        data.map(async (job: Job) => {
          const { data: entries } = await supabase
            .from("time_entries")
            .select("*")
            .eq("job_name", job.name)
            .order("clock_in", { ascending: false })
            .limit(10);
          if (entries) {
            timeData[job.id] = entries as TimeEntry[];
          }
        })
      );
      setJobTimeEntries(timeData);
    }
    setLoading(false);
  }

  async function handleAddJob() {
    if (!newJobName.trim()) return;
    setAddingJob(true);
    setAddJobError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddingJob(false); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) { setAddingJob(false); return; }
    const { error } = await supabase
      .from("jobs")
      .insert({ name: newJobName.trim(), is_active: true, company_id: profile.company_id });
    if (!error) {
      setNewJobName("");
      setShowAddJob(false);
      fetchJobs();
    } else {
      setAddJobError(error.message);
    }
    setAddingJob(false);
  }

  async function toggleJobActive(job: Job) {
    const { error } = await supabase
      .from("jobs")
      .update({ is_active: !job.is_active })
      .eq("id", job.id);
    
    if (!error) {
      fetchJobs();
    }
  }

  async function confirmDeleteJob() {
    if (!jobToDelete) return;
    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", jobToDelete.id);
    
    if (!error) {
      fetchJobs();
    }
    setJobToDelete(null);
  }

  function calculateTotalHours(entries: TimeEntry[]): number {
    return entries.reduce((sum, entry) => {
      const start = new Date(entry.clock_in).getTime();
      const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);
  }

  function calculateTotalPay(entries: TimeEntry[]): number {
    return entries.reduce((sum, entry) => {
      const start = new Date(entry.clock_in).getTime();
      const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
      const hours = (end - start) / (1000 * 60 * 60);
      return sum + hours * entry.hourly_rate;
    }, 0);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Jobs</h2>
        <button
          onClick={() => setShowAddJob(true)}
          className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Job
        </button>
      </div>

      {/* Add Job Form */}
      {showAddJob && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <label className="block text-xs font-medium text-slate-600 mb-2">
            New Job Name
          </label>
          {addJobError && (
            <p className="text-xs text-red-600 mb-2">{addJobError}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newJobName}
              onChange={(e) => setNewJobName(e.target.value)}
              placeholder="Enter job name"
              className="flex-1 rounded-lg border border-orange-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            <button
              onClick={handleAddJob}
              disabled={addingJob || !newJobName.trim()}
              className="rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {addingJob ? "…" : "Save"}
            </button>
            <button
              onClick={() => {
                setShowAddJob(false);
                setNewJobName("");
                setAddJobError("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Briefcase className="h-7 w-7 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">No jobs yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Add your first job to get started</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => {
            const entries = jobTimeEntries[job.id] || [];
            const totalHours = calculateTotalHours(entries);
            const totalPay = calculateTotalPay(entries);
            
            return (
              <div
                key={job.id}
                className={`rounded-xl border p-4 transition-all ${
                  job.is_active
                    ? "bg-white border-slate-100 shadow-sm hover:shadow-md"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        job.is_active ? "bg-orange-100" : "bg-slate-200"
                      }`}
                    >
                      <Briefcase
                        className={`h-5 w-5 ${
                          job.is_active ? "text-orange-600" : "text-slate-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <h3
                        className={`font-semibold ${
                          job.is_active ? "text-slate-900" : "text-slate-500"
                        }`}
                      >
                        {job.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {entries.length} time {entries.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setSelectedJob(job);
                        onSelectJob(job.name);
                        onClose();
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                      aria-label="Select for time entry"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleJobActive(job)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        job.is_active
                          ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          : "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                      }`}
                      aria-label={job.is_active ? "Deactivate" : "Activate"}
                    >
                      {job.is_active ? (
                        <Edit2 className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setJobToDelete(job)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-[10px] text-slate-400">Total Hours</p>
                      <p className="text-sm font-bold text-slate-900">
                        {totalHours.toFixed(1)}h
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="text-[10px] text-slate-400">Total Pay</p>
                      <p className="text-sm font-bold text-slate-900">
                        ${totalPay.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      job.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {job.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {jobToDelete && (
        <ConfirmDialog
          title="Delete Job"
          description={`Are you sure you want to delete "${jobToDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteJob}
          onCancel={() => setJobToDelete(null)}
        />
      )}
    </div>
  );
}
