"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronRight, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PeriodDetailView from "./PeriodDetailView";

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "active" | "finalized";
  period_type: string;
  company_id: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-blue-100 text-blue-700",
  finalized: "bg-emerald-100 text-emerald-700",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PayPeriodsListView() {
  const { profile } = useAuth();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    period_start: "",
    period_end: "",
    pay_date: "",
    period_type: "biweekly",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pay/periods?company_id=${profile.company_id}`);
      const json = res.ok ? await res.json() : { periods: [] };
      setPeriods(json.periods ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/pay/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, company_id: profile.company_id }),
    });
    const json = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      setForm({ period_start: "", period_end: "", pay_date: "", period_type: "biweekly" });
      load();
    } else {
      setCreateError(json.error ?? "Failed to create period");
    }
  }

  if (selectedPeriod) {
    return (
      <PeriodDetailView
        period={selectedPeriod}
        onBack={() => {
          setSelectedPeriod(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Pay Periods</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Period
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading pay periods…</div>
      ) : periods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No pay periods yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first pay period to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-50">
          {periods.map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {fmt(period.period_start)} — {fmt(period.period_end)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Pay date: {fmt(period.pay_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColors[period.status] ?? statusColors.draft}`}
                >
                  {period.status}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create Period Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">New Pay Period</h3>
            <form onSubmit={createPeriod} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period Start</label>
                <input
                  type="date"
                  required
                  value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period End</label>
                <input
                  type="date"
                  required
                  value={form.period_end}
                  onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Pay Date</label>
                <input
                  type="date"
                  required
                  value={form.pay_date}
                  onChange={(e) => setForm((f) => ({ ...f, pay_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period Type</label>
                <select
                  value={form.period_type}
                  onChange={(e) => setForm((f) => ({ ...f, period_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
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
