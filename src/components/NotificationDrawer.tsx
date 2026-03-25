"use client";

import { useEffect, useRef } from "react";
import { X, Bell, ClipboardList, LogIn, LogOut } from "lucide-react";
import { NotificationItem } from "@/lib/types";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const iconMap: Record<NotificationItem["type"], React.ElementType> = {
  clock_in: LogIn,
  clock_out: LogOut,
  task_insert: ClipboardList,
  task_update: ClipboardList,
  message: Bell,
};

export default function NotificationDrawer({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
}: NotificationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    onMarkAllRead();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, onMarkAllRead]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer - half-width on desktop, bottom sheet style on mobile */}
      <div
        ref={drawerRef}
        className="fixed z-50 flex flex-col bg-white shadow-2xl
          bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl
          sm:top-0 sm:right-0 sm:left-auto sm:bottom-0 sm:h-full sm:w-full sm:max-w-sm sm:rounded-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
              <Bell className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-center px-8">
                Activity from your crew will appear here in real time.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {notifications.map((n) => {
                const Icon = iconMap[n.type] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={`flex gap-3 px-4 py-3.5 transition-colors ${
                      !n.read ? "bg-yellow-50/60" : ""
                    }`}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 leading-snug">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {timeAgo(n.timestamp)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
