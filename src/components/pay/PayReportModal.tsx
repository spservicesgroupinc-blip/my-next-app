"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { X, Download, Send, Calendar, Clock, DollarSign, FileText, Loader2, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PayReportData } from "@/lib/types";

// ─── Date range presets ────────────────────────────────────────────────────────
function getPresets() {
  const today = new Date();
  const d = (dt: Date) => format(dt, "yyyy-MM-dd");
  return [
    { label: "This Week",    start: d(startOfWeek(today, { weekStartsOn: 1 })),          end: d(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: "Last Week",    start: d(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })), end: d(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })) },
    { label: "Last 2 Weeks", start: d(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })), end: d(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: "This Month",   start: d(startOfMonth(today)),                               end: d(endOfMonth(today)) },
    { label: "Last Month",   start: d(startOfMonth(subMonths(today, 1))),                 end: d(endOfMonth(subMonths(today, 1))) },
  ];
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, icon: Icon, sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-xl font-bold text-slate-900">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PayReportModalProps {
  onClose: () => void;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PayReportModal({ onClose, targetEmployeeId, targetEmployeeName }: PayReportModalProps) {
  const { user, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const presets = useMemo(() => getPresets(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [startDate, setStartDate] = useState(presets[1].start);
  const [endDate, setEndDate] = useState(presets[1].end);
  const [activePreset, setActivePreset] = useState("Last Week");

  const [reportData, setReportData] = useState<PayReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyPreset = useCallback((preset: { label: string; start: string; end: string }) => {
    setStartDate(preset.start);
    setEndDate(preset.end);
    setActivePreset(preset.label);
    setReportData(null);
    setError(null);
    setSubmitStatus("idle");
  }, []);

  const fetchReport = useCallback(async (start: string, end: string) => {
    if (!start || !end || start > end) return;
    setLoading(true);
    setError(null);
    setReportData(null);
    setSubmitStatus("idle");

    const employeeId = targetEmployeeId ?? user?.id;
    const params = new URLSearchParams({ start, end });
    if (employeeId) params.set("employee_id", employeeId);

    try {
      const res = await fetch(`/api/pay/report?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Failed to load report data");
        return;
      }
      const data: PayReportData = await res.json();
      setReportData(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [targetEmployeeId, user?.id]);

  useEffect(() => {
    if (startDate.length === 10 && endDate.length === 10 && startDate <= endDate) {
      fetchReport(startDate, endDate);
    }
  }, [startDate, endDate, fetchReport]);

  const handleSubmit = useCallback(async () => {
    if (!reportData || !profile || !user) return;
    setSubmitStatus("submitting");
    setSubmitError(null);

    const { error: insertError } = await supabase
      .from("pay_report_submissions")
      .insert({
        employee_id: targetEmployeeId ?? user!.id,
        company_id: profile.company_id,
        period_start: reportData.period_start,
        period_end: reportData.period_end,
        total_hours: reportData.total_hours,
        gross_pay: reportData.gross_pay,
        status: "submitted",
      });

    if (insertError) {
      setSubmitStatus("error");
      setSubmitError(insertError.message);
      return;
    }
    setSubmitStatus("submitted");
  }, [reportData, profile, supabase, targetEmployeeId, user]);

  const pdfFilename = reportData
    ? `pay-report-${reportData.employee.full_name.replace(/\s+/g, "-").toLowerCase()}-${startDate}-to-${endDate}.pdf`
    : "pay-report.pdf";

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!reportData) return;
    setPdfGenerating(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { PayReportPDF } = await import("./PayReportPDF");
      const blob = await pdf(<PayReportPDF data={reportData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  }, [reportData, pdfFilename]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <FileText className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pay Report{targetEmployeeName ? ` — ${targetEmployeeName}` : ""}
            </h2>
            <p className="text-xs text-slate-500">Generate and download your detailed pay report</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Date Range Section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            Pay Period
          </h3>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activePreset === p.label
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset("Custom");
                  setReportData(null);
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset("Custom");
                  setReportData(null);
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <span className="text-sm text-slate-500">Fetching your time entries…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Report data */}
        {reportData && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                label="Total Hours"
                value={`${reportData.total_hours.toFixed(2)} hrs`}
                icon={Clock}
                sub={`${reportData.entries.length} time entries`}
              />
              <SummaryCard
                label="Gross Pay"
                value={`$${reportData.gross_pay.toFixed(2)}`}
                icon={DollarSign}
                sub={`@ $${reportData.employee.hourly_rate}/hr base`}
              />
              {reportData.overtime_hours > 0 && (
                <SummaryCard
                  label="Overtime Hours"
                  value={`${reportData.overtime_hours.toFixed(2)} hrs`}
                  icon={Clock}
                  sub="Paid at 1.5x rate"
                />
              )}
              {reportData.doubletime_hours > 0 && (
                <SummaryCard
                  label="Doubletime Hours"
                  value={`${reportData.doubletime_hours.toFixed(2)} hrs`}
                  icon={Clock}
                  sub="Paid at 2x rate"
                />
              )}
            </div>

            {/* Time entries list */}
            {reportData.entries.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Time Entries</span>
                  <span className="text-xs text-slate-400">{reportData.entries.length} entries</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {reportData.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900">
                            {format(new Date(entry.clock_in), "EEE MMM d")}
                          </span>
                          {entry.overtime_hours > 0 && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">OT</span>
                          )}
                          {entry.doubletime_hours > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">DT</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {entry.job_name} · {format(new Date(entry.clock_in), "h:mm a")} → {entry.clock_out ? format(new Date(entry.clock_out), "h:mm a") : "—"}
                        </div>
                        {entry.notes && (
                          <div className="text-xs text-slate-400 mt-0.5 truncate italic">{entry.notes}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 ml-3 flex-shrink-0">
                        <span className="text-sm font-bold text-slate-900">${entry.entry_pay.toFixed(2)}</span>
                        <span className="text-xs text-slate-400">{entry.duration_hours.toFixed(2)} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">No completed time entries</p>
                <p className="text-xs text-slate-400 mt-1">Try selecting a different date range.</p>
              </div>
            )}

            {/* Submit success */}
            {submitStatus === "submitted" && (
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Report submitted to admin</p>
                  <p className="text-xs text-green-600 mt-0.5">Your admin can now review your submission.</p>
                </div>
              </div>
            )}

            {submitStatus === "error" && submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <strong>Submit failed:</strong> {submitError}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom action bar */}
      {reportData && !loading && (
        <div
          className="border-t border-slate-100 bg-white px-4 py-4 flex flex-col gap-2 flex-shrink-0"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating || reportData.entries.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Preparing PDF…</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>Download PDF Report</span>
              </>
            )}
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitStatus === "submitting" || submitStatus === "submitted" || reportData.entries.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitStatus === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting…</span>
              </>
            ) : submitStatus === "submitted" ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Submitted</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Submit Report to Admin</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
