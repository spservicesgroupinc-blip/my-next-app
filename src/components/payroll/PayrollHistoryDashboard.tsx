"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface HistoryPoint {
  label: string;
  gross: number;
  net: number;
  hours: number;
}

function BarChart({
  data,
  valueKey,
  color,
}: {
  data: HistoryPoint[];
  valueKey: "gross" | "net" | "hours";
  color: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const chartHeight = 120;

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(data.length * 48, 300)}
        height={chartHeight + 40}
        className="block"
      >
        {data.map((d, i) => {
          const barH = Math.max((d[valueKey] / max) * chartHeight, 2);
          const x = i * 48 + 8;
          const y = chartHeight - barH;
          const displayVal =
            valueKey === "hours"
              ? `${d[valueKey].toFixed(0)}h`
              : `$${d[valueKey].toFixed(0)}`;
          return (
            <g key={i}>
              <rect x={x} y={y} width={32} height={barH} rx={4} fill={color} />
              <text
                x={x + 16}
                y={chartHeight + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#94a3b8"
              >
                {d.label}
              </text>
              <text
                x={x + 16}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
                fontWeight="600"
              >
                {displayVal}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function PayrollHistoryDashboard() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const res = await fetch(
      `/api/pay/periods?company_id=${profile.company_id}&status=finalized&limit=12`
    );
    const json = res.ok ? await res.json() : { periods: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const points: HistoryPoint[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ([...(json.periods ?? [])] as any[]).reverse().map(async (period: any) => {
        const rRes = await fetch(`/api/pay/records?period_id=${period.id}`);
        const rJson = rRes.ok ? await rRes.json() : { records: [] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: any[] = rJson.records ?? [];
        const gross = records.reduce((s: number, r: any) => s + (r.gross_pay ?? 0), 0);
        const net = records.reduce((s: number, r: any) => s + (r.net_pay ?? 0), 0);
        const hours = records.reduce(
          (s: number, r: any) =>
            s + (r.regular_hours ?? 0) + (r.overtime_hours ?? 0) + (r.doubletime_hours ?? 0),
          0
        );
        const d = new Date(period.period_start);
        const label = `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`;
        return { label, gross, net, hours };
      })
    );

    setHistory(points);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const ytdGross = history.reduce((s, d) => s + d.gross, 0);
  const ytdNet = history.reduce((s, d) => s + d.net, 0);
  const ytdHours = history.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="space-y-4">
      {/* YTD Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "YTD Gross", value: `$${ytdGross.toFixed(0)}` },
          { label: "YTD Net", value: `$${ytdNet.toFixed(0)}` },
          { label: "YTD Hours", value: `${ytdHours.toFixed(0)}h` },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center"
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading history…</div>
      ) : history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm font-medium text-slate-500">No finalized pay periods yet</p>
          <p className="text-xs text-slate-400 mt-1">
            History will appear after you finalize pay periods.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3">Gross Payroll by Period</h4>
            <BarChart data={history} valueKey="gross" color="#f97316" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3">Hours Worked by Period</h4>
            <BarChart data={history} valueKey="hours" color="#3b82f6" />
          </div>
        </>
      )}
    </div>
  );
}
