"use client";

import { useState, useRef, useEffect } from "react";
import { CheckSquare, Bell, LogOut, ChevronDown, Settings } from "lucide-react";
import { TabId } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  activeTab: TabId;
  userInitials: string;
}

export default function Header({ activeTab, userInitials }: HeaderProps) {
  const { profile, isAdmin, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const tabLabels: Record<TabId, string> = {
    tasks: "Tasks",
    timeclock: "Time Clock",
    chat: "Chat",
    calendar: "Calendar",
    admin: "Admin",
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-white/95 backdrop-blur-sm px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <button 
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-md shadow-orange-600/20 transition-all active:scale-95 hover:shadow-lg hover:shadow-orange-600/30"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Go to top"
        >
          <CheckSquare className="h-5 w-5 text-white" />
        </button>
        <div>
          <span className="text-lg font-bold text-slate-900">
            Pro<span className="text-orange-600">Task</span>
          </span>
          <p className="text-[10px] text-slate-400 font-medium -mt-0.5">{tabLabels[activeTab]}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-90">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 ring-2 ring-white" />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-white shadow-md">
              {userInitials}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-11 z-50 w-48 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-200/50">
              <div className="px-3.5 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">
                  {profile?.full_name}
                </p>
                {isAdmin && (
                  <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">
                    Administrator
                  </span>
                )}
              </div>
              <button
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={async () => {
                  setShowMenu(false);
                  await signOut();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
