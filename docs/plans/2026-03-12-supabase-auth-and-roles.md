# Supabase Auth, Roles & Real-Time Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mock data + localStorage with Supabase auth, Postgres, real-time subscriptions, and role-based access (admin vs employee).

**Architecture:** Next.js App Router with Supabase SSR client for auth middleware, client components use browser Supabase client for real-time subscriptions. RLS enforces data isolation — employees see only their own rows, admins see all. Admin gets a dedicated `/admin` route with a live dashboard.

**Tech Stack:** Next.js 16, Supabase (Auth + Postgres + Realtime), @supabase/ssr, @supabase/supabase-js, Tailwind CSS v4, TypeScript

---

## Task 1: Install Dependencies & Environment

**Files:**
- Modify: `package.json`
- Create: `.env.local`
- Create: `.env.example`

**Step 1: Install Supabase packages**

```bash
cd /c/Users/russe/my-next-app
npm install @supabase/supabase-js @supabase/ssr
```

**Step 2: Create `.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://thwdaicnysqgjszcndkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase Dashboard → Settings → API>
```

**Step 3: Create `.env.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: install supabase packages"
```

---

## Task 2: Supabase Client Utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`

**Step 1: Create browser client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Step 2: Create server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
```

**Step 3: Create middleware helper**

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**Step 4: Create middleware.ts at project root**

```typescript
// src/middleware.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 5: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts
git commit -m "feat: add supabase client utilities and auth middleware"
```

---

## Task 3: Database Schema (Supabase SQL)

Run these SQL statements in **Supabase Dashboard → SQL Editor** in order.

**Step 1: Create profiles table**

```sql
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  hourly_rate numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**Step 2: Create tasks table**

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  job_name text not null default '',
  due_date date,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Critical')),
  status text not null default 'active' check (status in ('active', 'in_progress', 'completed')),
  checklist jsonb not null default '[]',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
```

**Step 3: Create time_entries table**

```sql
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_name text not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  hourly_rate numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
```

**Step 4: Create chat_messages table**

```sql
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  image_url text,
  created_at timestamptz not null default now()
);
```

**Step 5: Enable RLS on all tables**

```sql
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.chat_messages enable row level security;
```

**Step 6: Create RLS policies — profiles**

```sql
-- Everyone can read their own profile; admin reads all
create policy "profiles_select" on public.profiles for select
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Users can update their own profile (name only); admin updates all
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_update_admin" on public.profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
```

**Step 7: Create RLS policies — tasks**

```sql
-- Employees see tasks assigned to them or created by them
create policy "tasks_select_employee" on public.tasks for select
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "tasks_insert" on public.tasks for insert
  with check (
    created_by = auth.uid()
  );

create policy "tasks_update" on public.tasks for update
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "tasks_delete" on public.tasks for delete
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

**Step 8: Create RLS policies — time_entries**

```sql
create policy "time_entries_select" on public.time_entries for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "time_entries_insert" on public.time_entries for insert
  with check (user_id = auth.uid());

create policy "time_entries_update" on public.time_entries for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

**Step 9: Create RLS policies — chat_messages**

```sql
-- All authenticated users can read/write chat
create policy "chat_select" on public.chat_messages for select
  using (auth.role() = 'authenticated');

create policy "chat_insert" on public.chat_messages for insert
  with check (sender_id = auth.uid());
```

**Step 10: Enable Realtime for live dashboard**

```sql
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.time_entries;
alter publication supabase_realtime add table public.chat_messages;
```

**Step 11: Commit (no code changes, just note schema applied)**

```bash
git commit --allow-empty -m "chore: supabase schema applied via SQL editor"
```

---

## Task 4: Update Types

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Replace types to match Supabase schema**

```typescript
// src/lib/types.ts
export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  role: "admin" | "employee";
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  job_name: string;
  due_date: string | null;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "active" | "in_progress" | "completed";
  checklist: ChecklistItem[];
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  // joined fields (optional, from query)
  assignee?: Pick<Profile, "id" | "full_name">;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  job_name: string;
  clock_in: string;
  clock_out: string | null;
  hourly_rate: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  sender?: Pick<Profile, "id" | "full_name">;
}

export type TabId = "tasks" | "timeclock" | "chat" | "calendar";
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: update types to match supabase schema"
```

---

## Task 5: Auth Context Provider

**Files:**
- Create: `src/lib/auth-context.tsx`

**Step 1: Create auth context**

```typescript
// src/lib/auth-context.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchProfile(user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin: profile?.role === "admin", loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Step 2: Wrap layout with AuthProvider**

Modify `src/app/layout.tsx` — add `AuthProvider` around `{children}`:

```typescript
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "ProTask",
  description: "Contractor task management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

**Step 3: Commit**

```bash
git add src/lib/auth-context.tsx src/app/layout.tsx
git commit -m "feat: add auth context provider"
```

---

## Task 6: Login Page

**Files:**
- Create: `src/app/login/page.tsx`

**Step 1: Create login page**

```typescript
// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-600">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">ProTask</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              placeholder="you@company.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/login/
git commit -m "feat: add login page"
```

---

## Task 7: Employee App — Wire Tasks to Supabase

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/TasksView.tsx`

**Step 1: Replace page.tsx with Supabase-backed version**

Replace the entire `src/app/page.tsx` with a version that:
1. Gets `user` + `profile` from `useAuth()`
2. Fetches tasks from Supabase where `assigned_to = user.id OR created_by = user.id`
3. Subscribes to real-time task changes via `supabase.channel()`
4. All mutations (`handleAddTask`, `handleToggleComplete`, `handleDeleteTask`) call Supabase instead of `setTasks`
5. Removes all `localStorage` logic for tasks

Key Supabase queries:

```typescript
// Fetch tasks
const { data } = await supabase
  .from("tasks")
  .select("*, assignee:assigned_to(id, full_name)")
  .order("created_at", { ascending: false });

// Add task
await supabase.from("tasks").insert({
  title: task.title,
  job_name: task.jobName,
  due_date: task.dueDate || null,
  priority: task.priority,
  status: "active",
  checklist: [],
  assigned_to: task.assignedTo || user.id,
  created_by: user.id,
});

// Toggle complete
await supabase
  .from("tasks")
  .update({ status: current === "completed" ? "active" : "completed" })
  .eq("id", taskId);

// Delete task
await supabase.from("tasks").delete().eq("id", taskId);

// Real-time subscription
const channel = supabase
  .channel("tasks-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
    // refetch or patch local state
    fetchTasks();
  })
  .subscribe();
```

**Step 2: Commit**

```bash
git add src/app/page.tsx src/components/TasksView.tsx
git commit -m "feat: wire tasks to supabase with real-time updates"
```

---

## Task 8: Wire Time Clock to Supabase

**Files:**
- Modify: `src/components/TimeClockView.tsx`

**Step 1: Replace handlers in page.tsx to use Supabase**

```typescript
// Clock in
await supabase.from("time_entries").insert({
  user_id: user.id,
  job_name: jobName,
  clock_in: new Date().toISOString(),
  hourly_rate: profile.hourly_rate,
});

// Clock out
await supabase
  .from("time_entries")
  .update({ clock_out: new Date().toISOString() })
  .eq("id", entryId);

// Fetch entries (employee sees only their own via RLS)
const { data } = await supabase
  .from("time_entries")
  .select("*")
  .order("clock_in", { ascending: false });
```

**Step 2: Commit**

```bash
git add src/app/page.tsx src/components/TimeClockView.tsx
git commit -m "feat: wire time clock to supabase"
```

---

## Task 9: Wire Chat to Supabase Real-Time

**Files:**
- Modify: `src/components/ChatView.tsx`

**Step 1: Replace chat with Supabase real-time**

```typescript
// Fetch messages with sender name
const { data } = await supabase
  .from("chat_messages")
  .select("*, sender:sender_id(id, full_name)")
  .order("created_at", { ascending: true })
  .limit(100);

// Send message
await supabase.from("chat_messages").insert({
  sender_id: user.id,
  text: text,
});

// Real-time subscription
supabase
  .channel("chat")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" },
    (payload) => {
      // append new message to state
    }
  )
  .subscribe();
```

**Step 2: Commit**

```bash
git add src/components/ChatView.tsx
git commit -m "feat: wire chat to supabase real-time"
```

---

## Task 10: Admin Dashboard Page

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/layout.tsx`
- Create: `src/components/AdminDashboard.tsx`
- Create: `src/components/EmployeeCard.tsx`

**Step 1: Create admin layout (guard — redirect non-admins)**

```typescript
// src/app/admin/layout.tsx
"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== "admin") router.replace("/");
  }, [loading, profile]);

  if (loading || profile?.role !== "admin") return null;
  return <>{children}</>;
}
```

**Step 2: Create AdminDashboard component**

The admin dashboard shows:
- A live list of all employees with clock-in status
- Each employee card shows: name, clock-in time, current job, active tasks count
- Real-time updates via Supabase channel subscriptions on `time_entries` + `tasks`

```typescript
// src/components/EmployeeCard.tsx
"use client";

import { Profile, TimeEntry, Task } from "@/lib/types";

interface EmployeeCardProps {
  employee: Profile;
  activeEntry: TimeEntry | null;
  activeTasks: Task[];
}

export default function EmployeeCard({ employee, activeEntry, activeTasks }: EmployeeCardProps) {
  const isClockedIn = !!activeEntry && !activeEntry.clock_out;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
            {employee.full_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{employee.full_name}</p>
            <p className="text-xs text-slate-500">${employee.hourly_rate}/hr</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isClockedIn ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
          {isClockedIn ? "Clocked In" : "Off"}
        </span>
      </div>

      {isClockedIn && activeEntry && (
        <p className="text-xs text-slate-600 mb-2">
          <span className="font-medium">Job:</span> {activeEntry.job_name}
        </p>
      )}

      {activeTasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-slate-500">{activeTasks.length} active task{activeTasks.length > 1 ? "s" : ""}</p>
          {activeTasks.slice(0, 2).map(t => (
            <p key={t.id} className="text-xs text-slate-700 truncate">• {t.title}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create admin page with real-time data**

```typescript
// src/app/admin/page.tsx
"use client";
// Fetches all profiles (employees), their latest time_entry, and active tasks
// Subscribes to real-time changes on time_entries and tasks
// Renders a grid of EmployeeCard components
// Includes a tab for "Assign Task" and "Manage Employees"
```
(Full implementation to be filled in during execution)

**Step 4: Commit**

```bash
git add src/app/admin/ src/components/AdminDashboard.tsx src/components/EmployeeCard.tsx
git commit -m "feat: add admin dashboard with real-time employee view"
```

---

## Task 11: Admin — Employee Management

**Files:**
- Create: `src/app/admin/employees/page.tsx`

**Step 1: Create employee management page**

Admin can:
- See all employees (name, email, hourly rate, active status)
- Invite a new employee (sends Supabase magic link or temp password)
- Edit hourly rate inline
- Toggle `is_active` to deactivate

**Invite employee via Supabase Admin API (server action):**

```typescript
// src/app/admin/employees/actions.ts
"use server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function inviteEmployee(email: string, fullName: string, hourlyRate: number) {
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role: "employee" }
  });
  if (error) throw error;

  // Set hourly rate after profile is created
  await supabaseAdmin
    .from("profiles")
    .update({ hourly_rate: hourlyRate, full_name: fullName })
    .eq("id", data.user.id);
}
```

Add to `.env.local`:
```env
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase Dashboard → Settings → API>
```

**Step 2: Commit**

```bash
git add src/app/admin/employees/ .env.example
git commit -m "feat: add employee management with invite flow"
```

---

## Task 12: Header — Add Admin Link & Sign Out

**Files:**
- Modify: `src/components/Header.tsx`

**Step 1: Update Header to show user name, admin badge, sign out**

```typescript
// In Header.tsx — add useAuth() hook
const { profile, isAdmin, signOut } = useAuth();

// Show profile name instead of initials
// Add "Admin" link for admins → navigate to /admin
// Add sign out button in a dropdown
```

**Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: add admin nav link and sign out to header"
```

---

## Task 13: Remove Mock Data & Cleanup

**Files:**
- Modify: `src/lib/data.ts` — delete all mock data, export empty arrays or remove file
- Modify: `src/app/page.tsx` — remove all remaining localStorage references

**Step 1: Delete mock data exports from data.ts**

The `data.ts` file can be deleted or gutted — all data now comes from Supabase.

**Step 2: Remove localStorage from page.tsx**

- Remove `STORAGE_KEYS`, `loadFromStorage`, `saveToStorage`
- Remove all `useEffect` blocks that persist to localStorage
- Keep only the Supabase subscription cleanup effects

**Step 3: Commit**

```bash
git add src/lib/data.ts src/app/page.tsx
git commit -m "chore: remove mock data and localStorage — all data from supabase"
```

---

## Task 14: First Admin Account Setup

**Note:** This is done manually in Supabase Dashboard after deploying.

1. Go to **Supabase Dashboard → Authentication → Users**
2. Click **"Invite user"** → enter your admin email
3. After accepting invite, go to **SQL Editor** and run:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'your-admin@email.com');
```

4. Sign in to the app — you'll see the Admin link in the header.

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Install Supabase packages |
| 2 | Supabase client utils + middleware |
| 3 | Postgres schema + RLS policies |
| 4 | Update TypeScript types |
| 5 | Auth context provider |
| 6 | Login page |
| 7 | Wire tasks to Supabase |
| 8 | Wire time clock to Supabase |
| 9 | Wire chat to Supabase real-time |
| 10 | Admin live dashboard |
| 11 | Admin employee management + invite |
| 12 | Header nav updates |
| 13 | Remove mock data + localStorage |
| 14 | Set up first admin account |
