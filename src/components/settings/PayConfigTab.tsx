"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PayConfig {
  dailyOtThreshold: number;
  weeklyOtThreshold: number;
  otMultiplier: number;
  dtMultiplier: number;
  federalTaxRate: number;
  stateTaxRate: number;
}

const DEFAULTS: PayConfig = {
  dailyOtThreshold: 8,
  weeklyOtThreshold: 40,
  otMultiplier: 1.5,
  dtMultiplier: 2.0,
  federalTaxRate: 10,
  stateTaxRate: 5,
};

export default function PayConfigTab() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [config, setConfig] = useState<PayConfig>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;

    supabase
      .from("pay_config")
      .select("*")
      .eq("company_id", profile.company_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setConfig({
            dailyOtThreshold: Number(data.daily_ot_threshold),
            weeklyOtThreshold: Number(data.weekly_ot_threshold),
            otMultiplier: Number(data.ot_multiplier),
            dtMultiplier: Number(data.dt_multiplier),
            federalTaxRate: Number(data.federal_tax_rate),
            stateTaxRate: Number(data.state_tax_rate),
          });
        }
        setLoading(false);
      });
  }, [profile?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(key: keyof PayConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: parseFloat(value) || 0 }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;

    await supabase.from("pay_config").upsert(
      {
        company_id: profile.company_id,
        daily_ot_threshold: config.dailyOtThreshold,
        weekly_ot_threshold: config.weeklyOtThreshold,
        ot_multiplier: config.otMultiplier,
        dt_multiplier: config.dtMultiplier,
        federal_tax_rate: config.federalTaxRate,
        state_tax_rate: config.stateTaxRate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fields: {
    key: keyof PayConfig;
    label: string;
    hint: string;
    step: string;
  }[] = [
    {
      key: "dailyOtThreshold",
      label: "Daily OT Threshold (hours)",
      hint: "Hours per day before overtime kicks in",
      step: "0.5",
    },
    {
      key: "weeklyOtThreshold",
      label: "Weekly OT Threshold (hours)",
      hint: "Total weekly hours before overtime kicks in",
      step: "1",
    },
    {
      key: "otMultiplier",
      label: "OT Pay Multiplier",
      hint: "e.g. 1.5 = time and a half",
      step: "0.1",
    },
    {
      key: "dtMultiplier",
      label: "Double-Time Multiplier",
      hint: "e.g. 2.0 for weekends",
      step: "0.1",
    },
    {
      key: "federalTaxRate",
      label: "Federal Tax Rate (%)",
      hint: "Percentage withheld for federal taxes",
      step: "0.5",
    },
    {
      key: "stateTaxRate",
      label: "State Tax Rate (%)",
      hint: "Percentage withheld for state taxes",
      step: "0.5",
    },
  ];

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200 mb-4" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900 mb-1">Pay Configuration</h2>
      <p className="text-sm text-slate-500 mb-5">
        These settings are used when calculating payroll for your team.
      </p>
      <form onSubmit={handleSave} className="space-y-5">
        {fields.map(({ key, label, hint, step }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
            <p className="text-xs text-slate-400 mb-1.5">{hint}</p>
            <input
              type="number"
              value={config[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              step={step}
              min="0"
              className="w-full max-w-xs rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        ))}
        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}
