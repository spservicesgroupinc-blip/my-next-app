"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ManualEntry {
  id: string;
  user_id: string;
  job_name: string;
  clock_in: string;
  clock_out: string;
  hours: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  employeeName?: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ManualTimeApprovalQueue() {
  const supabase = createClient();
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pay/manual-time");
    const json = res.ok ? await res.json() : { entries: [] };
    const rawEntries: ManualEntry[] = json.entries ?? json.manual_entries ?? [];

    const ids = [...new Set(rawEntries.map((e) => e.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const nameMap = Object.fromEntries(
        (profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])
      );
      setEntries(rawEntries.map((e) => ({ ...e, employeeName: nameMap[e.user_id] ?? "Unknown" })));
    } else {
      setEntries([]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setProcessing(id);
    await fetch(`/api/pay/manual-time/${id}/${action}`, { method: "POST" });
    setProcessing(null);
    load();
  }

  const filtered =
    filter === "pending" ? entries.filter((e) => e.status === "pending") : entries;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Manual Time Approvals</h3>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-orange-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">
            {filter === "pending" ? "No pending approvals" : "No manual time entries"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{entry.employeeName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {entry.job_name} · {(entry.hours ?? 0).toFixed(1)}h
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmt(entry.clock_in)} → {fmt(entry.clock_out)}
                  </p>
                  {entry.reason && (
                    <p className="text-xs text-slate-600 mt-1.5 italic">&quot;{entry.reason}&quot;</p>
                  )}
                </div>
                {entry.status === "pending" ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => handleAction(entry.id, "approve")}
                      disabled={processing === entry.id}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                      title="Approve"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleAction(entry.id, "reject")}
                      disabled={processing === entry.id}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
                      title="Reject"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      entry.status === "approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {entry.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
