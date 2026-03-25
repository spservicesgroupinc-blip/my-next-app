"use client";

import { useState, useEffect } from "react";
import { X, Clock, Briefcase, Calendar, DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface TimeEntryModalProps {
  onClose: () => void;
  onAddTime: (entry: {
    job_name: string;
    clock_in: string;
    clock_out: string;
    hours: number;
    hourly_rate: number;
    notes: string;
  }) => void;
}

export default function TimeEntryModal({ onClose, onAddTime }: TimeEntryModalProps) {
  const supabase = createClient();
  const [jobNames, setJobNames] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [addingJob, setAddingJob] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [hourlyRate, setHourlyRate] = useState("25");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("jobs")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const names = (data ?? []).map((j: { name: string }) => j.name);
        setJobNames(names);
        if (names.length > 0) setSelectedJob(names[0]);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const calculateHours = () => {
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, diff);
  };

  const hours = calculateHours();

  async function handleAddJob() {
    if (!newJobName.trim()) return;
    setAddingJob(true);
    setError(null);
    const { error } = await supabase
      .from("jobs")
      .insert({ name: newJobName.trim(), is_active: true });
    if (error) {
      setError("Failed to add job");
    } else {
      setJobNames((prev) => [...prev, newJobName.trim()].sort());
      setSelectedJob(newJobName.trim());
      setNewJobName("");
      setShowNewJob(false);
    }
    setAddingJob(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedJob) {
      setError("Please select a job");
      return;
    }

    if (hours <= 0) {
      setError("End time must be after start time");
      return;
    }

    setSubmitting(true);

    const clockIn = new Date(`${date}T${startTime}`).toISOString();
    const clockOut = new Date(`${date}T${endTime}`).toISOString();

    onAddTime({
      job_name: selectedJob,
      clock_in: clockIn,
      clock_out: clockOut,
      hours,
      hourly_rate: parseFloat(hourlyRate) || 25,
      notes,
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[155] bg-slate-900/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-[160] mx-auto w-full max-w-lg">
        <div
          className="m-4 rounded-t-2xl bg-white shadow-2xl max-h-[90dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">Log Time Entry</h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 pb-8">
            <div className="flex flex-col gap-4">
              {/* Job Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Job *
                </label>
                <select
                  value={selectedJob}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      setShowNewJob(true);
                      setSelectedJob("");
                    } else {
                      setSelectedJob(e.target.value);
                      setShowNewJob(false);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {jobNames.length === 0 ? (
                    <option value="">No jobs available</option>
                  ) : (
                    jobNames.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))
                  )}
                  <option value="__ADD_NEW__" className="font-semibold">
                    ＋ Add New Job…
                  </option>
                </select>

                {showNewJob && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newJobName}
                      onChange={(e) => setNewJobName(e.target.value)}
                      placeholder="New job name"
                      className="flex-1 rounded-md border border-blue-300 bg-yellow-50 px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddJob}
                      disabled={addingJob || !newJobName.trim()}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />
                  Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <Clock className="inline h-3.5 w-3.5 mr-1" />
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <Clock className="inline h-3.5 w-3.5 mr-1" />
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Hours Summary */}
              <div className="rounded-lg bg-yellow-50 border border-yellow-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">Total Hours</span>
                  <span className="text-xl font-bold text-blue-600">{hours.toFixed(2)}h</span>
                </div>
              </div>

              {/* Hourly Rate */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <DollarSign className="inline h-3.5 w-3.5 mr-1" />
                  Hourly Rate *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Notes (optional) */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this time entry..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || hours <= 0 || !selectedJob}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving…" : "Save Entry"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
