# ProTask App Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the dead admin live feed, wire all broken buttons, build a full settings page, and build a complete payroll management UI.

**Architecture:** Fix Supabase realtime by enabling replica identity on required tables, repair the AdminView race condition using a ref pattern, add a settings route with 5 tabs, and add a Payroll tab to AdminView backed by existing API routes.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (Auth + Realtime), Tailwind CSS 4, TypeScript, Lucide React icons

---

## Phase 1 — Fix Admin Live Feed (Critical)

### Task 1: Enable Supabase Realtime on required tables

**Files:**
- No app files changed — run SQL via Supabase MCP or dashboard

**Step 1: Run migration SQL**

Use the Supabase MCP `execute_sql` tool (or the Supabase dashboard SQL editor) to run:

```sql
-- Enable full replica identity so realtime can send old + new row data
ALTER TABLE time_entries REPLICA IDENTITY FULL;
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE employee_locations REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- Add all tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE employee_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

**Step 2: Verify in Supabase dashboard**

Go to Database → Replication → supabase_realtime publication. Confirm all 5 tables are listed.

---

### Task 2: Fix AdminView.tsx — eliminate race condition and unstable subscriptions

**Files:**
- Modify: `src/components/AdminView.tsx`

**The problem (lines 152-237):**
1. `employees` is in the `useEffect` dependency array — so every time employees state updates, the entire channel subscription is torn down and rebuilt. This causes connection instability.
2. Inside event handlers, `employees.find(...)` reads the stale closure value captured when the effect last ran — so employee names come back as "Unknown".
3. Missing UPDATE handler for `time_entries` (clock-out events don't refresh status).
4. No connection status indicator.

**Step 1: Add an `employeesRef` alongside state and a `connectionStatus` state**

Replace this section at the top of the `AdminView` function (after the existing state declarations, around line 71):

```typescript
const [employees, setEmployees] = useState<EmployeeWithStatus[]>([]);
const employeesRef = useRef<EmployeeWithStatus[]>([]);
const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
```

And update `setEmployees` calls to also update the ref. In `loadEmployees` (line 130), change:

```typescript
setEmployees(enriched);
// Add this line directly after:
employeesRef.current = enriched;
```

**Step 2: Replace the entire `useEffect` subscription block**

Replace lines 152–237 with:

```typescript
useEffect(() => {
  loadEmployees();
  loadEmails();
  loadJobs();

  // Tick every second to update elapsed times
  const tickInterval = setInterval(() => setTick((t) => t + 1), 1000);

  // Real-time: watch time_entries, tasks, jobs, employee_locations
  const sub = supabase
    .channel("admin-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "time_entries" },
      async (payload) => {
        // Refresh employee list
        await loadEmployees();
        // Use ref (always fresh) for name lookup
        const emp = employeesRef.current.find(
          (e) => e.id === (payload.new as any).user_id
        );
        // If still not found (brand new employee), fetch profile directly
        let employeeName = emp?.full_name ?? null;
        if (!employeeName) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", (payload.new as any).user_id)
            .single();
          employeeName = prof?.full_name ?? "Unknown";
        }
        setActivityFeed((prev) => [
          {
            id: crypto.randomUUID(),
            type: "clock_in",
            employeeName,
            jobName: (payload.new as any).job_name,
            timestamp: new Date().toISOString(),
          },
          ...prev.slice(0, 49),
        ]);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "time_entries" },
      async (payload) => {
        // clock-out event — refresh to update status cards
        await loadEmployees();
        const entry = payload.new as any;
        if (entry.clock_out) {
          const emp = employeesRef.current.find((e) => e.id === entry.user_id);
          let employeeName = emp?.full_name ?? null;
          if (!employeeName) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", entry.user_id)
              .single();
            employeeName = prof?.full_name ?? "Unknown";
          }
          setActivityFeed((prev) => [
            {
              id: crypto.randomUUID(),
              type: "clock_out",
              employeeName,
              jobName: entry.job_name,
              timestamp: new Date().toISOString(),
            },
            ...prev.slice(0, 49),
          ]);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "time_entries" },
      () => {
        loadEmployees();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tasks" },
      async (payload) => {
        await loadEmployees();
        const emp = employeesRef.current.find(
          (e) => e.id === (payload.new as any).created_by
        );
        let employeeName = emp?.full_name ?? null;
        if (!employeeName) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", (payload.new as any).created_by)
            .single();
          employeeName = prof?.full_name ?? "Unknown";
        }
        setActivityFeed((prev) => [
          {
            id: crypto.randomUUID(),
            type: "task_insert",
            employeeName,
            taskTitle: (payload.new as any).title,
            jobName: (payload.new as any).job_name,
            timestamp: new Date().toISOString(),
          },
          ...prev.slice(0, 49),
        ]);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tasks" },
      async (payload) => {
        await loadEmployees();
        const emp = employeesRef.current.find(
          (e) => e.id === (payload.new as any).updated_by
        );
        let employeeName = emp?.full_name ?? null;
        if (!employeeName && (payload.new as any).updated_by) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", (payload.new as any).updated_by)
            .single();
          employeeName = prof?.full_name ?? "Unknown";
        }
        setActivityFeed((prev) => [
          {
            id: crypto.randomUUID(),
            type: "task_update",
            employeeName: employeeName ?? "Someone",
            taskTitle: (payload.new as any).title,
            timestamp: new Date().toISOString(),
          },
          ...prev.slice(0, 49),
        ]);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "jobs" },
      () => loadJobs()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setConnectionStatus("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnectionStatus("disconnected");
      else setConnectionStatus("connecting");
    });

  return () => {
    supabase.removeChannel(sub);
    clearInterval(tickInterval);
  };
  // IMPORTANT: Do NOT include `employees` in deps — use employeesRef.current inside handlers instead
}, [loadEmployees, loadEmails, loadJobs, supabase]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 3: Add connection status indicator in the Live tab header**

In the JSX where the Live tab header/stats are rendered, find the stats row at the top of the live tab and add a connection badge before the stats:

```tsx
{/* Connection status indicator */}
<div className="flex items-center gap-1.5 mb-3">
  <span
    className={`inline-flex h-2 w-2 rounded-full ${
      connectionStatus === 'connected'
        ? 'bg-emerald-500 animate-none'
        : connectionStatus === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-500'
    }`}
  />
  <span className="text-xs text-slate-500 font-medium capitalize">
    {connectionStatus === 'connected' ? 'Live' : connectionStatus}
  </span>
</div>
```

**Step 4: Commit**

```bash
git add src/components/AdminView.tsx
git commit -m "fix: repair admin live feed - use ref pattern and add UPDATE handler for clock-out"
```

---

## Phase 2 — Wire Broken Header Buttons

### Task 3: Wire the Settings button in Header.tsx

**Files:**
- Modify: `src/components/Header.tsx`

**Step 1: Add router import and wire onClick**

The Header component is a client component. Add `useRouter` and wire the Settings button:

```typescript
// Add to imports at top
import { useRouter } from "next/navigation";
```

Inside the component function, add:
```typescript
const router = useRouter();
```

Replace the Settings button (lines 85-90) with:
```tsx
<button
  onClick={() => {
    setShowMenu(false);
    router.push('/settings');
  }}
  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
>
  <Settings className="h-4 w-4" />
  Settings
</button>
```

**Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "fix: wire Settings button to navigate to /settings"
```

---

### Task 4: Create NotificationDrawer component

**Files:**
- Create: `src/components/NotificationDrawer.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X, Bell, Clock, ClipboardList, LogIn, LogOut } from "lucide-react";

export interface NotificationItem {
  id: string;
  type: "clock_in" | "clock_out" | "task_insert" | "task_update" | "message";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

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

const iconMap = {
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-orange-600" />
            <h2 className="text-base font-bold text-slate-900">Notifications</h2>
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                {notifications.filter((n) => !n.read).length}
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
                      !n.read ? "bg-orange-50/60" : ""
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
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
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
```

**Step 2: Commit**

```bash
git add src/components/NotificationDrawer.tsx
git commit -m "feat: add NotificationDrawer slide-over component"
```

---

### Task 5: Wire notification bell in Header and feed it activity data

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/types.ts`

**Step 1: Add NotificationItem to types.ts**

Append to `src/lib/types.ts`:
```typescript
// ─── Notification ─────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  type: "clock_in" | "clock_out" | "task_insert" | "task_update" | "message";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}
```

**Step 2: Update Header props to accept notifications and callback**

Replace Header's interface and component signature:

```typescript
import NotificationDrawer from "@/components/NotificationDrawer";
import { NotificationItem } from "@/lib/types";

interface HeaderProps {
  activeTab: TabId;
  userInitials: string;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
}

export default function Header({ activeTab, userInitials, notifications, onMarkAllRead }: HeaderProps) {
  // ...existing code...
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;
```

Wire the Bell button:
```tsx
<button
  onClick={() => setShowNotifications(true)}
  className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-90"
>
  <Bell className="h-5 w-5" />
  {unreadCount > 0 && (
    <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 ring-2 ring-white" />
  )}
</button>

<NotificationDrawer
  isOpen={showNotifications}
  onClose={() => setShowNotifications(false)}
  notifications={notifications}
  onMarkAllRead={() => {
    onMarkAllRead();
    setShowNotifications(false);
  }}
/>
```

**Step 3: Add notifications state to page.tsx**

In `src/app/page.tsx`, add state near the top of `HomeInner`:
```typescript
import { NotificationItem } from "@/lib/types";

const [notifications, setNotifications] = useState<NotificationItem[]>([]);

const addNotification = useCallback((item: Omit<NotificationItem, 'id' | 'read'>) => {
  setNotifications((prev) => [
    { ...item, id: crypto.randomUUID(), read: false },
    ...prev.slice(0, 49),
  ]);
}, []);

const markAllRead = useCallback(() => {
  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
}, []);
```

In the existing `chatSub` realtime handler in page.tsx, after `setChatMessages`, call:
```typescript
addNotification({
  type: "message",
  title: `New message from ${(data as ChatMessage).sender?.full_name ?? "Someone"}`,
  body: (data as ChatMessage).text.slice(0, 80),
  timestamp: new Date().toISOString(),
});
```

Pass to Header:
```tsx
<Header
  activeTab={activeTab}
  userInitials={userInitials}
  notifications={notifications}
  onMarkAllRead={markAllRead}
/>
```

**Step 4: Commit**

```bash
git add src/lib/types.ts src/components/Header.tsx src/app/page.tsx
git commit -m "feat: wire notification bell with real-time activity drawer"
```

---

## Phase 3 — Full Settings Page

### Task 6: Create Settings page shell with tab layout

**Files:**
- Create: `src/app/settings/page.tsx`

```tsx
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
        <nav className="mb-6 flex gap-1 overflow-x-auto pb-1 lg:mb-0 lg:w-48 lg:shrink-0 lg:flex-col lg:pb-0">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-orange-600 text-white shadow-sm shadow-orange-600/30"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
```

**Commit:**
```bash
git add src/app/settings/page.tsx
git commit -m "feat: add settings page shell with tabbed layout"
```

---

### Task 7: Build ProfileTab

**Files:**
- Create: `src/components/settings/ProfileTab.tsx`

```tsx
"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function ProfileTab() {
  const { profile, user } = useAuth();
  const supabase = createClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", user!.id);
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Profile updated." });
    }
  }

  async function handlePasswordReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Password reset email sent." });
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">Your Profile</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Your full name"
          />
        </div>

        {message && (
          <p className={`text-sm font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handlePasswordReset}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Reset Password
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/settings/ProfileTab.tsx
git commit -m "feat: add Profile settings tab"
```

---

### Task 8: Build NotificationsTab

**Files:**
- Create: `src/components/settings/NotificationsTab.tsx`

```tsx
"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";

export default function NotificationsTab() {
  const { user } = useAuth();
  const { isSubscribed, subscribe, unsubscribe } = usePushNotifications(user?.id);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } finally {
      setLoading(false);
    }
  }

  const supported = typeof window !== "undefined" && "PushManager" in window;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900 mb-1">Push Notifications</h2>
        <p className="text-sm text-slate-500 mb-5">
          Receive notifications about crew activity, task updates, and messages.
        </p>

        {!supported ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            Push notifications are not supported in this browser. Install the app to your home screen first (iOS/Android), or use Chrome/Edge on desktop.
          </div>
        ) : (
          <button
            onClick={toggle}
            disabled={loading}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-60 ${
              isSubscribed
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "bg-orange-600 text-white hover:bg-orange-700 shadow-sm shadow-orange-600/30"
            }`}
          >
            {isSubscribed ? (
              <>
                <BellOff className="h-4 w-4" />
                {loading ? "Disabling…" : "Disable Notifications"}
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" />
                {loading ? "Enabling…" : "Enable Notifications"}
              </>
            )}
          </button>
        )}

        {isSubscribed && (
          <p className="mt-3 text-xs text-emerald-600 font-medium">
            ✓ Push notifications are active on this device.
          </p>
        )}
      </div>
    </div>
  );
}
```

**Note:** Check what `usePushNotifications` exports. If it doesn't expose `subscribe`/`unsubscribe` directly, expose them from the hook. Read `src/lib/usePushNotifications.ts` and add the return values if missing.

**Commit:**
```bash
git add src/components/settings/NotificationsTab.tsx
git commit -m "feat: add Notifications settings tab with push toggle"
```

---

### Task 9: Build EmployeeManagementTab (admin)

**Files:**
- Create: `src/components/settings/EmployeeManagementTab.tsx`

This reuses the existing employee management logic from AdminView but as a standalone settings tab.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Save, X, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface EmployeeRow extends Profile {
  email?: string;
}

export default function EmployeeManagementTab() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "employee">("employee");
  const [editSaving, setEditSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRate, setNewRate] = useState("0");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    const emailRes = await fetch("/api/admin/employees");
    const emailJson = emailRes.ok ? await emailRes.json() : { emailMap: {} };
    const emailMap: Record<string, string> = emailJson.emailMap ?? {};
    setEmployees((data ?? []).map((p: Profile) => ({ ...p, email: emailMap[p.id] })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openEdit(emp: EmployeeRow) {
    setEditId(emp.id);
    setEditName(emp.full_name);
    setEditRate(String(emp.hourly_rate));
    setEditRole(emp.role);
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: editName.trim(),
      hourly_rate: parseFloat(editRate) || 0,
      role: editRole,
    }).eq("id", editId);
    setEditSaving(false);
    if (!error) {
      setEditId(null);
      load();
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);
    const res = await fetch("/api/admin/invite-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim(), password: newPassword, full_name: newName.trim(), hourly_rate: parseFloat(newRate) || 0 }),
    });
    const json = await res.json();
    setAddLoading(false);
    if (!res.ok) {
      setAddError(json.error ?? "Failed to add employee");
    } else {
      setShowAdd(false);
      setNewEmail(""); setNewName(""); setNewPassword(""); setNewRate("0");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Team Members</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Invite
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {employees.map((emp) => (
              <li key={emp.id} className="px-5 py-4">
                {editId === emp.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Hourly Rate ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as "admin" | "employee")}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      >
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-white">
                        {emp.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{emp.full_name}</p>
                        <p className="text-xs text-slate-400 truncate">{emp.email ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${emp.role === "admin" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                        {emp.role}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">${emp.hourly_rate}/hr</span>
                      <button
                        onClick={() => openEdit(emp)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Invite Employee</h3>
            <form onSubmit={handleAddEmployee} className="space-y-3">
              <input type="text" placeholder="Full Name" value={newName} onChange={(e) => setNewName(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              <input type="email" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              <input type="password" placeholder="Temporary Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              <input type="number" placeholder="Hourly Rate" value={newRate} onChange={(e) => setNewRate(e.target.value)} min="0" step="0.01" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={addLoading} className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors">
                  {addLoading ? "Inviting…" : "Invite"}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/settings/EmployeeManagementTab.tsx
git commit -m "feat: add Employee Management settings tab"
```

---

### Task 10: Build CompanyTab and PayConfigTab

**Files:**
- Create: `src/components/settings/CompanyTab.tsx`
- Create: `src/components/settings/PayConfigTab.tsx`

**CompanyTab.tsx:**
```tsx
"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function CompanyTab() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from("companies").select("name").eq("id", profile.company_id).single().then(({ data }) => {
      if (data) setCompanyName(data.name ?? "");
      setLoading(false);
    });
  }, [profile, supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("companies").update({ name: companyName.trim() }).eq("id", profile.company_id);
    setSaving(false);
    setMessage(error ? { type: "error", text: error.message } : { type: "success", text: "Company name updated." });
  }

  if (loading) return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">Company Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        {message && (
          <p className={`text-sm font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
        )}
        <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
```

**PayConfigTab.tsx** — stores config in localStorage under `protask_pay_config` (no extra DB table needed):
```tsx
"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";

interface PayConfig {
  dailyOtThreshold: number;
  weeklyOtThreshold: number;
  otMultiplier: number;
  dtMultiplier: number;
  federalTaxRate: number;
  stateTaxRate: number;
}

const DEFAULTS: PayConfig = {
  dailyOtThreshold: 8,
  weeklyOtThreshold: 40,
  otMultiplier: 1.5,
  dtMultiplier: 2.0,
  federalTaxRate: 10,
  stateTaxRate: 5,
};

export default function PayConfigTab() {
  const [config, setConfig] = useState<PayConfig>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("protask_pay_config");
      if (stored) setConfig(JSON.parse(stored));
    } catch {}
  }, []);

  function handleChange(key: keyof PayConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: parseFloat(value) || 0 }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("protask_pay_config", JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const fields: { key: keyof PayConfig; label: string; hint: string; step: string }[] = [
    { key: "dailyOtThreshold", label: "Daily OT Threshold (hours)", hint: "Hours per day before OT kicks in", step: "0.5" },
    { key: "weeklyOtThreshold", label: "Weekly OT Threshold (hours)", hint: "Total weekly hours before OT kicks in", step: "1" },
    { key: "otMultiplier", label: "OT Pay Multiplier", hint: "e.g. 1.5 = time and a half", step: "0.1" },
    { key: "dtMultiplier", label: "Double-Time Multiplier", hint: "e.g. 2.0 for double-time on weekends", step: "0.1" },
    { key: "federalTaxRate", label: "Federal Tax Rate (%)", hint: "Percentage withheld for federal taxes", step: "0.5" },
    { key: "stateTaxRate", label: "State Tax Rate (%)", hint: "Percentage withheld for state taxes", step: "0.5" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-bold text-slate-900 mb-1">Pay Configuration</h2>
      <p className="text-sm text-slate-500 mb-5">These settings are used when calculating payroll for your team.</p>
      <form onSubmit={handleSave} className="space-y-5">
        {fields.map(({ key, label, hint, step }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-700 mb-0.5">{label}</label>
            <p className="text-xs text-slate-400 mb-1.5">{hint}</p>
            <input
              type="number"
              value={config[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              step={step}
              min="0"
              className="w-full max-w-xs rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        ))}
        <button type="submit" className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors">
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/settings/CompanyTab.tsx src/components/settings/PayConfigTab.tsx
git commit -m "feat: add Company and Pay Configuration settings tabs"
```

---

## Phase 4 — Payroll UI

### Task 11: Add Payroll tab to AdminView and build PayrollTab shell

**Files:**
- Modify: `src/components/AdminView.tsx` — add "payroll" to `AdminTab` type and tab bar
- Create: `src/components/payroll/PayrollTab.tsx`

**Step 1: Update AdminTab type in AdminView.tsx**

Change line 26:
```typescript
type AdminTab = "live" | "employees" | "jobs" | "map" | "payroll";
```

Add import:
```typescript
import PayrollTab from "@/components/payroll/PayrollTab";
```

In the tab bar JSX (where "live", "employees", "jobs", "map" tabs are rendered), add:
```tsx
<button
  onClick={() => setAdminTab("payroll")}
  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl transition-all ${adminTab === "payroll" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-800"}`}
>
  <DollarSign className="h-4 w-4" />
  Payroll
</button>
```

Add `DollarSign` to the lucide-react import at line 4.

In the tab content area, add:
```tsx
{adminTab === "payroll" && <PayrollTab />}
```

**Step 2: Create PayrollTab shell**

Create `src/components/payroll/PayrollTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BarChart3, Clock, CheckSquare, History } from "lucide-react";
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
```

**Commit:**
```bash
git add src/components/AdminView.tsx src/components/payroll/PayrollTab.tsx
git commit -m "feat: add Payroll tab to admin panel with sub-tab shell"
```

---

### Task 12: Build PayPeriodsListView with PeriodDetailView

**Files:**
- Create: `src/components/payroll/PayPeriodsListView.tsx`
- Create: `src/components/payroll/PeriodDetailView.tsx`

**PayPeriodsListView.tsx:**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, ChevronRight, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import PeriodDetailView from "./PeriodDetailView";

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "active" | "finalized";
  period_type: string;
  company_id: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-blue-100 text-blue-700",
  finalized: "bg-emerald-100 text-emerald-700",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PayPeriodsListView() {
  const { profile } = useAuth();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ period_start: "", period_end: "", pay_date: "", period_type: "biweekly" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const res = await fetch(`/api/pay/periods?company_id=${profile.company_id}`);
    const json = res.ok ? await res.json() : { periods: [] };
    setPeriods(json.periods ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setCreating(true);
    const res = await fetch("/api/pay/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, company_id: profile.company_id }),
    });
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      setForm({ period_start: "", period_end: "", pay_date: "", period_type: "biweekly" });
      load();
    }
  }

  if (selectedPeriod) {
    return <PeriodDetailView period={selectedPeriod} onBack={() => { setSelectedPeriod(null); load(); }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Pay Periods</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Period
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading pay periods…</div>
      ) : periods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No pay periods yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first pay period to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-50">
          {periods.map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {fmt(period.period_start)} — {fmt(period.period_end)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Pay date: {fmt(period.pay_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColors[period.status]}`}>
                  {period.status}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create Period Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">New Pay Period</h3>
            <form onSubmit={createPeriod} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period Start</label>
                <input type="date" required value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period End</label>
                <input type="date" required value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Pay Date</label>
                <input type="date" required value={form.pay_date} onChange={(e) => setForm((f) => ({ ...f, pay_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Period Type</label>
                <select value={form.period_type} onChange={(e) => setForm((f) => ({ ...f, period_type: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-orange-500 focus:outline-none">
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={creating} className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors">
                  {creating ? "Creating…" : "Create"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

**PeriodDetailView.tsx:**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Download, Play, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "draft" | "active" | "finalized";
  company_id: string;
}

interface PayRecord {
  id: string;
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  net_pay: number;
  status: string;
}

interface EmployeeRecord extends PayRecord {
  employeeName: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function PeriodDetailView({ period, onBack }: { period: PayPeriod; onBack: () => void }) {
  const { profile } = useAuth();
  const supabase = createClient();
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [recordsRes, profRes] = await Promise.all([
      fetch(`/api/pay/records?period_id=${period.id}`),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    const recordsJson = recordsRes.ok ? await recordsRes.json() : { records: [] };
    const profs: Profile[] = profRes.data ?? [];
    setEmployees(profs);
    const enriched: EmployeeRecord[] = (recordsJson.records ?? []).map((r: PayRecord) => ({
      ...r,
      employeeName: profs.find((p) => p.id === r.employee_id)?.full_name ?? "Unknown",
    }));
    setRecords(enriched);
    setLoading(false);
  }, [period.id, supabase]);

  useEffect(() => { load(); }, [load]);

  async function runPayroll() {
    setRunningPayroll(true);
    await Promise.all(
      employees.map((emp) =>
        fetch("/api/pay/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: emp.id, pay_period_id: period.id }),
        })
      )
    );
    setRunningPayroll(false);
    load();
  }

  async function finalizePeriod() {
    setFinalizing(true);
    await fetch(`/api/pay/periods/${period.id}/close`, { method: "POST" });
    setFinalizing(false);
    onBack();
  }

  function exportCsv() {
    const header = "Employee,Regular Hrs,OT Hrs,DT Hrs,Gross Pay,Federal Tax,State Tax,SS,Medicare,Net Pay\n";
    const rows = records.map((r) =>
      [r.employeeName, r.regular_hours, r.overtime_hours, r.doubletime_hours,
       r.gross_pay.toFixed(2), r.federal_tax.toFixed(2), r.state_tax.toFixed(2),
       r.social_security.toFixed(2), r.medicare.toFixed(2), r.net_pay.toFixed(2)].join(",")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${period.period_start}-${period.period_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = records.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross_pay,
      net: acc.net + r.net_pay,
      hours: acc.hours + r.regular_hours + r.overtime_hours + r.doubletime_hours,
    }),
    { gross: 0, net: 0, hours: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{fmt(period.period_start)} — {fmt(period.period_end)}</h3>
          <p className="text-xs text-slate-400">Pay date: {fmt(period.pay_date)}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Gross", value: money(totals.gross) },
          { label: "Total Net", value: money(totals.net) },
          { label: "Total Hours", value: `${totals.hours.toFixed(1)}h` },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-base font-bold text-slate-900 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {period.status !== "finalized" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runPayroll}
            disabled={runningPayroll}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            {runningPayroll ? "Calculating…" : "Run Payroll"}
          </button>
          <button
            onClick={finalizePeriod}
            disabled={finalizing || records.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            {finalizing ? "Finalizing…" : "Finalize Period"}
          </button>
          <button
            onClick={exportCsv}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {/* Records table */}
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading records…</div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
          <p className="text-sm font-medium text-slate-500">No pay records yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Run Payroll" to calculate pay for this period.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Employee", "Reg Hrs", "OT Hrs", "DT Hrs", "Gross", "Taxes", "Net Pay"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.regular_hours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.overtime_hours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.doubletime_hours.toFixed(1)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{money(r.gross_pay)}</td>
                  <td className="px-4 py-3 text-red-600">{money(r.federal_tax + r.state_tax + r.social_security + r.medicare)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{money(r.net_pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/payroll/PayPeriodsListView.tsx src/components/payroll/PeriodDetailView.tsx
git commit -m "feat: build pay periods list and period detail views with run payroll and export"
```

---

### Task 13: Build ManualTimeApprovalQueue

**Files:**
- Create: `src/components/payroll/ManualTimeApprovalQueue.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ManualEntry {
  id: string;
  user_id: string;
  job_name: string;
  clock_in: string;
  clock_out: string;
  hours: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  employeeName?: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function ManualTimeApprovalQueue() {
  const supabase = createClient();
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pay/manual-time");
    const json = res.ok ? await res.json() : { entries: [] };
    const rawEntries: ManualEntry[] = json.entries ?? [];

    // Enrich with employee names
    const ids = [...new Set(rawEntries.map((e) => e.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

    setEntries(rawEntries.map((e) => ({ ...e, employeeName: nameMap[e.user_id] ?? "Unknown" })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setProcessing(id);
    await fetch(`/api/pay/manual-time/${id}/${action}`, { method: "POST" });
    setProcessing(null);
    load();
  }

  const filtered = filter === "pending" ? entries.filter((e) => e.status === "pending") : entries;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Manual Time Approvals</h3>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filter === f ? "bg-orange-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">
            {filter === "pending" ? "No pending approvals" : "No manual time entries"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{entry.employeeName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{entry.job_name} · {entry.hours.toFixed(1)}h</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmt(entry.clock_in)} → {fmt(entry.clock_out)}
                  </p>
                  {entry.reason && (
                    <p className="text-xs text-slate-600 mt-1.5 italic">"{entry.reason}"</p>
                  )}
                </div>
                {entry.status === "pending" ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => handleAction(entry.id, "approve")}
                      disabled={processing === entry.id}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleAction(entry.id, "reject")}
                      disabled={processing === entry.id}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    entry.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                  }`}>
                    {entry.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/payroll/ManualTimeApprovalQueue.tsx
git commit -m "feat: build manual time approval queue with approve/reject actions"
```

---

### Task 14: Build PayrollHistoryDashboard with charts

**Files:**
- Create: `src/components/payroll/PayrollHistoryDashboard.tsx`

Use native SVG bar charts (no chart library needed — keeps the bundle lean):

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface HistoryPoint {
  label: string;
  gross: number;
  net: number;
  hours: number;
}

function BarChart({ data, valueKey, color, unit }: {
  data: HistoryPoint[];
  valueKey: "gross" | "net" | "hours";
  color: string;
  unit: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const height = 120;

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(data.length * 48, 300)}
        height={height + 40}
        className="block"
      >
        {data.map((d, i) => {
          const barH = Math.max((d[valueKey] / max) * height, 2);
          const x = i * 48 + 8;
          const y = height - barH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={32} height={barH} rx={4} fill={color} />
              <text x={x + 16} y={height + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {d.label}
              </text>
              <text x={x + 16} y={y - 4} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight="600">
                {valueKey === "hours" ? d[valueKey].toFixed(0) : `$${d[valueKey].toFixed(0)}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function PayrollHistoryDashboard() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const res = await fetch(`/api/pay/periods?company_id=${profile.company_id}&status=finalized&limit=12`);
    const json = res.ok ? await res.json() : { periods: [] };

    const points: HistoryPoint[] = await Promise.all(
      (json.periods ?? []).reverse().map(async (period: any) => {
        const rRes = await fetch(`/api/pay/records?period_id=${period.id}`);
        const rJson = rRes.ok ? await rRes.json() : { records: [] };
        const records: any[] = rJson.records ?? [];
        const gross = records.reduce((s: number, r: any) => s + (r.gross_pay ?? 0), 0);
        const net = records.reduce((s: number, r: any) => s + (r.net_pay ?? 0), 0);
        const hours = records.reduce((s: number, r: any) => s + (r.regular_hours ?? 0) + (r.overtime_hours ?? 0) + (r.doubletime_hours ?? 0), 0);
        const d = new Date(period.period_start);
        const label = `${d.toLocaleDateString("en-US", { month: "short" })} ${d.getDate()}`;
        return { label, gross, net, hours };
      })
    );

    setHistory(points);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const ytdGross = history.reduce((s, d) => s + d.gross, 0);
  const ytdNet = history.reduce((s, d) => s + d.net, 0);
  const ytdHours = history.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="space-y-4">
      {/* YTD Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "YTD Gross", value: `$${ytdGross.toFixed(0)}` },
          { label: "YTD Net", value: `$${ytdNet.toFixed(0)}` },
          { label: "YTD Hours", value: `${ytdHours.toFixed(0)}h` },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading history…</div>
      ) : history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm font-medium text-slate-500">No finalized pay periods yet</p>
          <p className="text-xs text-slate-400 mt-1">History will appear after you finalize pay periods.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3">Gross Payroll by Period</h4>
            <BarChart data={history} valueKey="gross" color="#f97316" unit="$" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3">Hours Worked by Period</h4>
            <BarChart data={history} valueKey="hours" color="#3b82f6" unit="h" />
          </div>
        </>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add src/components/payroll/PayrollHistoryDashboard.tsx
git commit -m "feat: build payroll history dashboard with SVG bar charts"
```

---

## Final Verification Checklist

After all tasks are done, verify:

- [ ] Open Admin panel → Live tab → Connection dot shows green "Live"
- [ ] Clock in/out an employee → Activity feed updates within ~1 second, name is correct
- [ ] Click Settings gear in header dropdown → Navigates to /settings
- [ ] Click bell icon → NotificationDrawer slides open
- [ ] /settings loads with all tabs (Profile, Notifications, Employees, Company, Pay Config for admin)
- [ ] Edit an employee name/rate → saves correctly
- [ ] Admin panel → Payroll tab → Pay Periods visible
- [ ] Create a new pay period → appears in list
- [ ] Run Payroll on a period → records appear in table
- [ ] Export CSV → downloads file
- [ ] Manual Time Approvals → approve/reject works
- [ ] History tab shows charts after finalizing a period

**Final commit:**
```bash
git add -A
git commit -m "feat: complete ProTask app - live feed fix, settings page, payroll UI, notification drawer"
```
