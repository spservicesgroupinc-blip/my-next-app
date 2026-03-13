"use client";

import { useState, useEffect } from "react";
import { Play, Square, DollarSign, Briefcase, Clock } from "lucide-react";
import { TimeEntry } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface TimeClockViewProps {
  timeEntries: TimeEntry[];
  onClockIn: (jobName: string) => void;
  onClockOut: (entryId: string) => void;
}

export default function TimeClockView({
  timeEntries,
  onClockIn,
  onClockOut,
}: TimeClockViewProps) {
  const supabase = createClient();
  const [jobNames, setJobNames] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState("");

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

  const activeShift = timeEntries.find((e) => e.clock_out === null);

  const calcHours = (entry: TimeEntry): number => {
    const start = new Date(entry.clock_in).getTime();
    const end = entry.clock_out ? new Date(entry.clock_out).getTime() : Date.now();
    return (end - start) / (1000 * 60 * 60);
  };

  const totalHours = timeEntries.reduce((sum, e) => sum + calcHours(e), 0);
  const totalPay = timeEntries.reduce(
    (sum, e) => sum + calcHours(e) * e.hourly_rate,
    0
  );

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status Card */}
      <div className={`rounded-xl p-5 shadow-sm ${activeShift ? "bg-emerald-50 border border-emerald-200" : "bg-white border border-slate-100"}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`h-3 w-3 rounded-full ${activeShift ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
          <span className={`text-sm font-semibold ${activeShift ? "text-emerald-700" : "text-slate-500"}`}>
            {activeShift ? "Currently Clocked In" : "Not Clocked In"}
          </span>
        </div>

        {activeShift && (
          <div className="mb-3 text-xs text-emerald-600">
            <span className="font-medium">{activeShift.job_name}</span> — since {formatTime(activeShift.clock_in)}
          </div>
        )}

        {!activeShift && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Select Job</label>
            <select
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {jobNames.length === 0 ? (
                <option value="">No jobs available</option>
              ) : (
                jobNames.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))
              )}
            </select>
          </div>
        )}

        <button
          onClick={() => {
            if (activeShift) {
              onClockOut(activeShift.id);
            } else {
              onClockIn(selectedJob);
            }
          }}
          className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] ${
            activeShift
              ? "bg-red-500 hover:bg-red-600"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {activeShift ? (
            <>
              <Square className="h-4 w-4" /> Clock Out
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Clock In
            </>
          )}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">Total Hours</span>
          </div>
          <span className="text-xl font-bold text-slate-900">{totalHours.toFixed(1)}h</span>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-slate-500">Total Pay</span>
          </div>
          <span className="text-xl font-bold text-slate-900">${totalPay.toFixed(2)}</span>
        </div>
      </div>

      {/* Time entries */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Entries</h3>
        <div className="flex flex-col gap-2">
          {timeEntries.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No time entries yet.</div>
          ) : (
            timeEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
                    <Briefcase className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{entry.job_name}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(entry.clock_in)} · {formatTime(entry.clock_in)}
                      {entry.clock_out ? ` – ${formatTime(entry.clock_out)}` : " – now"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {calcHours(entry).toFixed(1)}h
                  </p>
                  <p className="text-xs text-emerald-600 font-medium">
                    ${(calcHours(entry) * entry.hourly_rate).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
