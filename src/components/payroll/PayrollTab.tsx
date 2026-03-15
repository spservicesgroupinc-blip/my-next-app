"use client";

import { useState } from "react";
import { Clock, CheckSquare, History } from "lucide-react";
import PayPeriodsListView from "./PayPeriodsListView";
import ManualTimeApprovalQueue from "./ManualTimeApprovalQueue";
import PayrollHistoryDashboard from "./PayrollHistoryDashboard";

type PayrollSubTab = "periods" | "approvals" | "history";

const subTabs: { id: PayrollSubTab; label: string; icon: React.ElementType }[] = [
  { id: "periods", label: "Pay Periods", icon: Clock },
  { id: "approvals", label: "Approvals", icon: CheckSquare },
  { id: "history", label: "History", icon: History },
];

export default function PayrollTab() {
  const [subTab, setSubTab] = useState<PayrollSubTab>("periods");

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                subTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {subTab === "periods" && <PayPeriodsListView />}
      {subTab === "approvals" && <ManualTimeApprovalQueue />}
      {subTab === "history" && <PayrollHistoryDashboard />}
    </div>
  );
}
