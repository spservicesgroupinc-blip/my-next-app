"use client";

import { CheckSquare, Bell, Plus } from "lucide-react";
import { TabId } from "@/lib/types";

interface HeaderProps {
  activeTab: TabId;
  onAddTask: () => void;
  userInitials: string;
}

export default function Header({ activeTab, onAddTask, userInitials }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600">
          <CheckSquare className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900">
          Pro<span className="text-orange-600">Task</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {activeTab === "tasks" && (
          <button
            onClick={onAddTask}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white shadow-md transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
        <button className="relative p-1 text-slate-500 hover:text-slate-700">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-600" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
