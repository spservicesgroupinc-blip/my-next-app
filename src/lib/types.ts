// ─── Checklist ───────────────────────────────────────────────────────────────
export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

// ─── Profile (matches public.profiles) ───────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string;
  role: "admin" | "employee";
  hourly_rate: number;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

// ─── Task (matches public.tasks) ─────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  job_name: string;
  due_date: string | null;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "active" | "in_progress" | "completed";
  checklist: ChecklistItem[];
  assigned_to: string | null;
  created_by: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  // Joined fields (from profile joins)
  assignee?: Pick<Profile, "id" | "full_name">;
}

// ─── TimeEntry (matches public.time_entries) ──────────────────────────────────
export interface TimeEntry {
  id: string;
  user_id: string;
  job_name: string;
  clock_in: string;
  clock_out: string | null;
  hourly_rate: number;
  company_id: string;
  created_at: string;
}

// ─── ChatMessage (matches public.chat_messages) ───────────────────────────────
export interface ChatMessage {
  id: string;
  sender_id: string;
  text: string;
  image_url: string | null;
  company_id: string;
  created_at: string;
  // Joined field
  sender?: Pick<Profile, "id" | "full_name">;
}

// ─── Job (matches public.jobs) ────────────────────────────────────────────────
export interface Job {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

// ─── UI ───────────────────────────────────────────────────────────────────────
export type TabId = "tasks" | "timeclock" | "chat" | "calendar" | "admin";
