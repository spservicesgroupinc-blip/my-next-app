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
  updated_by: string | null;      // profile id of last editor
  updated_by_name: string | null; // denormalized name for audit display
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
  notes: string | null;
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
  company_id: string;
  created_at: string;
}

// ─── EmployeeLocation (matches public.employee_locations) ─────────────────────
export interface EmployeeLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
}

// ─── UI ───────────────────────────────────────────────────────────────────────
export type TabId = "tasks" | "timeclock" | "chat" | "calendar" | "admin";

// ─── Notification ─────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  type: "clock_in" | "clock_out" | "task_insert" | "task_update" | "message";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

// ─── Company (matches public.companies) ───────────────────────────────────────
export interface Company {
  id: string;
  name: string;
  created_at: string;
}

// ─── TimeEntryWithHours — time entry enriched with calculated hour breakdown ──
export interface TimeEntryWithHours extends TimeEntry {
  duration_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  entry_pay: number;
}

// ─── PayReportData — full data needed to render the PDF ───────────────────────
export interface PayReportData {
  employee: Profile;
  company: Company;
  period_start: string;    // YYYY-MM-DD
  period_end: string;      // YYYY-MM-DD
  entries: TimeEntryWithHours[];
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  generated_at: string;    // ISO timestamp
}

// ─── PayReportSubmission (matches public.pay_report_submissions) ───────────────
export interface PayReportSubmission {
  id: string;
  employee_id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  gross_pay: number;
  status: "submitted" | "reviewed" | "approved";
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  // Joined fields
  employee?: Pick<Profile, "id" | "full_name">;
}
