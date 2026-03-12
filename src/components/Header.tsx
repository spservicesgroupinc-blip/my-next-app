"use client";

import { useState } from "react";
import { CheckSquare, Bell, Plus, LogOut, ChevronDown } from "lucide-react";
import { TabId } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  activeTab: TabId;
  onAddTask: () => void;
  userInitials: string;
}

export default function Header({ activeTab, onAddTask, userInitials }: HeaderProps) {
  const { profile, isAdmin, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

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

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-1.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {userInitials}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">
                  {profile?.full_name}
                </p>
                {isAdmin && (
                  <span className="text-[10px] font-medium text-orange-600 uppercase">
                    Admin
                  </span>
                )}
              </div>
              <button
                onClick={async () => {
                  setShowMenu(false);
                  await signOut();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
