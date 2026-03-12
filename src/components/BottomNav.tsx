"use client";

import { ClipboardList, Clock, MessageCircle, CalendarDays, Shield } from "lucide-react";
import { TabId } from "@/lib/types";

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isAdmin?: boolean;
}

const baseTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "timeclock", label: "Time Clock", icon: Clock },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

const adminTab = { id: "admin" as TabId, label: "Admin", icon: Shield };

export default function BottomNav({ activeTab, onTabChange, isAdmin }: BottomNavProps) {
  const tabs = isAdmin ? [...baseTabs, adminTab] : baseTabs;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive ? "text-orange-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
