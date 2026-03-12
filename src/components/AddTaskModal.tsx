"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { jobNames } from "@/lib/data";

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (task: {
    title: string;
    assignedTo: string;
    jobName: string;
    dueDate: string;
    priority: "Low" | "Medium" | "High" | "Critical";
  }) => void;
  initialDate?: string;
}

export default function AddTaskModal({ onClose, onAdd, initialDate }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [jobName, setJobName] = useState(jobNames[0]);
  const [dueDate, setDueDate] = useState(initialDate || "");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !assignedTo.trim() || !dueDate) return;
    onAdd({ title: title.trim(), assignedTo: assignedTo.trim(), jobName, dueDate, priority });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 animate-[slideUp_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">New Task</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="e.g. Install kitchen cabinets"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="e.g. Mike Johnson"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Job / Project</label>
              <select
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {jobNames.map((j) => (
                  <option key={j}>{j}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "Low" | "Medium" | "High" | "Critical")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-orange-700 active:scale-[0.98]"
          >
            Add Task
          </button>
        </form>
      </div>
    </div>
  );
}
