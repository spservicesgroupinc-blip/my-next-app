"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

export default function NotificationsTab() {
  const [permissionState, setPermissionState] = useState<NotificationPermission | null>(
    typeof Notification !== "undefined" ? Notification.permission : null
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window;

  async function handleEnable() {
    setLoading(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission === "granted") {
        setMessage("Notifications enabled successfully.");
      } else {
        setMessage(
          "Permission denied. Please enable notifications in your browser settings."
        );
      }
    } catch {
      setMessage("Failed to request notification permission.");
    } finally {
      setLoading(false);
    }
  }

  const isGranted = permissionState === "granted";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Push Notifications</h2>
        <p className="text-sm text-slate-500 mb-5">
          Receive notifications about crew activity, task updates, and messages.
        </p>

        {!supported ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            Push notifications are not supported in this browser. Install the app to your home
            screen first (iOS/Android), or use Chrome/Edge on desktop.
          </div>
        ) : isGranted ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <Bell className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications are enabled</p>
              <p className="text-xs text-slate-500">
                You will receive push notifications on this device.
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleEnable}
            disabled={loading || permissionState === "denied"}
            className="flex items-center gap-2.5 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-all shadow-sm shadow-orange-600/30"
          >
            <Bell className="h-4 w-4" />
            {loading ? "Requesting…" : "Enable Notifications"}
          </button>
        )}

        {permissionState === "denied" && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            Notifications are blocked. To enable them, click the lock icon in your browser&apos;s
            address bar and allow notifications.
          </div>
        )}

        {message && (
          <p className="mt-3 text-sm font-medium text-slate-600">{message}</p>
        )}
      </div>
    </div>
  );
}
