"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Bell, Users, Building2, DollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ProfileTab from "@/components/settings/ProfileTab";
import NotificationsTab from "@/components/settings/NotificationsTab";
import EmployeeManagementTab from "@/components/settings/EmployeeManagementTab";
import CompanyTab from "@/components/settings/CompanyTab";
import PayConfigTab from "@/components/settings/PayConfigTab";

type SettingsTab = "profile" | "notifications" | "employees" | "company" | "pay";

const tabs: { id: SettingsTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "employees", label: "Employees", icon: Users, adminOnly: true },
  { id: "company", label: "Company", icon: Building2, adminOnly: true },
  { id: "pay", label: "Pay Config", icon: DollarSign, adminOnly: true },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900">Settings</h1>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 lg:flex lg:gap-6">
        {/* Sidebar tabs */}
        <nav className="mb-6 flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0 lg:mb-0 lg:w-48 lg:shrink-0 lg:flex-col lg:pb-0">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all min-w-fit ${
                  isActive
                    ? "bg-orange-600 text-white shadow-sm shadow-orange-600/30"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-white border border-slate-100 lg:border-0 lg:bg-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "employees" && isAdmin && <EmployeeManagementTab />}
          {activeTab === "company" && isAdmin && <CompanyTab />}
          {activeTab === "pay" && isAdmin && <PayConfigTab />}
        </div>
      </div>
    </div>
  );
}
