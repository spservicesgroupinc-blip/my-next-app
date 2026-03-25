"use client";

import type { ElementType } from "react";
import { ClipboardList, Clock, MessageCircle, CalendarDays, Shield, Plus } from "lucide-react";
import { TabId } from "@/lib/types";

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddTask: () => void;
  isAdmin?: boolean;
  unreadChatCount?: number;
}

const leftTabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "timeclock", label: "Clock", icon: Clock },
];

const rightTabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

const adminTab = { id: "admin" as TabId, label: "Admin", icon: Shield };

export default function BottomNav({ activeTab, onTabChange, onAddTask, isAdmin, unreadChatCount = 0 }: BottomNavProps) {
  const right = isAdmin ? [...rightTabs, adminTab] : rightTabs;

  const renderTab = (tab: { id: TabId; label: string; icon: ElementType }) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    const isAdminTab = tab.id === "admin";
    const activeColor = isAdminTab ? "text-blue-600" : "text-blue-600";
    const showBadge = tab.id === "chat" && unreadChatCount > 0;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`relative flex flex-col items-center gap-0.5 min-w-[3.5rem] px-3 py-2.5 transition-all duration-150 ${
          isActive ? activeColor : "text-slate-400 hover:text-slate-600"
        }`}
      >
        {isActive && (
          <span className="absolute top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-current" />
        )}
        <span className="relative">
          <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
          {showBadge && (
            <span className="absolute -top-1.5 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white leading-none">
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </span>
          )}
        </span>
        <span className={`text-[11px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-1 relative">
        {/* Left tabs */}
        {leftTabs.map(renderTab)}

        {/* Center FAB - Enlarged, no label needed */}
        <div className="flex items-center justify-center">
          <button
            onClick={onAddTask}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-900 text-white shadow-lg shadow-blue-600/40
              transition-all duration-200 active:scale-90 hover:shadow-xl hover:shadow-blue-600/50 hover:-translate-y-0.5
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Add new item"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
            {/* Subtle ring animation on hover */}
            <span className="absolute inset-0 rounded-full border-2 border-blue-400 opacity-0 hover:opacity-20 transition-opacity" />
          </button>
        </div>

        {/* Right tabs */}
        {right.map(renderTab)}
      </div>
    </nav>
  );
}
