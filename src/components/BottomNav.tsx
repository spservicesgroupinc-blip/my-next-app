"use client";

import { ClipboardList, Clock, MessageCircle, CalendarDays, Shield, Plus } from "lucide-react";
import { TabId } from "@/lib/types";

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddTask: () => void;
  isAdmin?: boolean;
}

const leftTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "timeclock", label: "Clock", icon: Clock },
];

const rightTabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

const adminTab = { id: "admin" as TabId, label: "Admin", icon: Shield };

export default function BottomNav({ activeTab, onTabChange, onAddTask, isAdmin }: BottomNavProps) {
  const right = isAdmin ? [...rightTabs, adminTab] : rightTabs;

  const renderTab = (tab: { id: TabId; label: string; icon: React.ElementType }) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 transition-colors ${
          isActive ? "text-orange-600" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-1.5 relative">
        {/* Left tabs */}
        {leftTabs.map(renderTab)}

        {/* Center FAB */}
        <div className="flex flex-col items-center -mt-5">
          <button
            onClick={onAddTask}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg shadow-orange-600/30 transition-transform active:scale-90 hover:bg-orange-700"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>

        {/* Right tabs */}
        {right.map(renderTab)}
      </div>
    </nav>
  );
}
