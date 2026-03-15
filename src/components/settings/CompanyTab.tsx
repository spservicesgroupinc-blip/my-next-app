"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function CompanyTab() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .single()
      .then(({ data }) => {
        if (data) setCompanyName((data as { name: string }).name ?? "");
        setLoading(false);
      });
  }, [profile, supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("companies")
      .update({ name: companyName.trim() })
      .eq("id", profile.company_id);
    setSaving(false);
    setMessage(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "Company name updated." }
    );
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">Company Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        {message && (
          <p
            className={`text-sm font-medium ${
              message.type === "success" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
