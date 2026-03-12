export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  assignedTo: string;
  jobName: string;
  dueDate: string; // ISO date string
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "active" | "completed";
  checklist: ChecklistItem[];
}

export interface TimeEntry {
  id: string;
  jobName: string;
  clockIn: string; // ISO datetime
  clockOut: string | null;
  hourlyRate: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string; // ISO datetime
  image?: string;
}

export type TabId = "tasks" | "timeclock" | "chat" | "calendar";
