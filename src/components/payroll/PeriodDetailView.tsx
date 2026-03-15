"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Download, Play, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "active" | "finalized";
  company_id: string;
}

interface PayRecord {
  id: string;
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  net_pay: number;
  status: string;
}

interface EmployeeRecord extends PayRecord {
  employeeName: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(n: number) {
  return `$${(n ?? 0).toFixed(2)}`;
}

interface Props {
  period: PayPeriod;
  onBack: () => void;
}

export default function PeriodDetailView({ period, onBack }: Props) {
  const { profile: _profile } = useAuth();
  const supabase = createClient();
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [recordsRes, profRes] = await Promise.all([
      fetch(`/api/pay/records?period_id=${period.id}`),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    const recordsJson = recordsRes.ok ? await recordsRes.json() : { records: [] };
    const profs: Profile[] = profRes.data ?? [];
    setEmployees(profs);
    const enriched: EmployeeRecord[] = (recordsJson.records ?? []).map((r: PayRecord) => ({
      ...r,
      employeeName: profs.find((p) => p.id === r.employee_id)?.full_name ?? "Unknown",
    }));
    setRecords(enriched);
    setLoading(false);
  }, [period.id, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function runPayroll() {
    setRunningPayroll(true);
    await Promise.all(
      employees.map((emp) =>
        fetch("/api/pay/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: emp.id, pay_period_id: period.id }),
        })
      )
    );
    setRunningPayroll(false);
    load();
  }

  async function finalizePeriod() {
    if (!confirm("Finalize this pay period? This cannot be undone.")) return;
    setFinalizing(true);
    await fetch(`/api/pay/periods/${period.id}/close`, { method: "POST" });
    setFinalizing(false);
    onBack();
  }

  function exportCsv() {
    const header =
      "Employee,Regular Hrs,OT Hrs,DT Hrs,Gross Pay,Federal Tax,State Tax,SS,Medicare,Net Pay\n";
    const rows = records.map((r) =>
      [
        r.employeeName,
        r.regular_hours,
        r.overtime_hours,
        r.doubletime_hours,
        (r.gross_pay ?? 0).toFixed(2),
        (r.federal_tax ?? 0).toFixed(2),
        (r.state_tax ?? 0).toFixed(2),
        (r.social_security ?? 0).toFixed(2),
        (r.medicare ?? 0).toFixed(2),
        (r.net_pay ?? 0).toFixed(2),
      ].join(",")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${period.period_start}-${period.period_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = records.reduce(
    (acc, r) => ({
      gross: acc.gross + (r.gross_pay ?? 0),
      net: acc.net + (r.net_pay ?? 0),
      hours:
        acc.hours +
        (r.regular_hours ?? 0) +
        (r.overtime_hours ?? 0) +
        (r.doubletime_hours ?? 0),
    }),
    { gross: 0, net: 0, hours: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {fmt(period.period_start)} — {fmt(period.period_end)}
          </h3>
          <p className="text-xs text-slate-400">Pay date: {fmt(period.pay_date)}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Gross", value: money(totals.gross) },
          { label: "Total Net", value: money(totals.net) },
          { label: "Total Hours", value: `${totals.hours.toFixed(1)}h` },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center"
          >
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {period.status !== "finalized" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runPayroll}
            disabled={runningPayroll}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            {runningPayroll ? "Calculating…" : "Run Payroll"}
          </button>
          <button
            onClick={finalizePeriod}
            disabled={finalizing || records.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            {finalizing ? "Finalizing…" : "Finalize Period"}
          </button>
          <button
            onClick={exportCsv}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {/* Records table */}
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading records…</div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
          <p className="text-sm font-medium text-slate-500">No pay records yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Click &quot;Run Payroll&quot; to calculate pay for this period.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Employee", "Reg Hrs", "OT Hrs", "DT Hrs", "Gross", "Taxes", "Net Pay"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-slate-600">{(r.regular_hours ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-600">{(r.overtime_hours ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-600">{(r.doubletime_hours ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{money(r.gross_pay)}</td>
                  <td className="px-4 py-3 text-red-600">
                    {money(
                      (r.federal_tax ?? 0) +
                        (r.state_tax ?? 0) +
                        (r.social_security ?? 0) +
                        (r.medicare ?? 0)
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{money(r.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
