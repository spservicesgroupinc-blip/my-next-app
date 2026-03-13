"use client";

import { useState } from "react";
import { Search, ClipboardCheck } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";
import TaskCard from "./TaskCard";
import AddTaskModal from "./AddTaskModal";

interface TasksViewProps {
  tasks: Task[];
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddLineItem: (taskId: string, text: string) => void;
  onAddTask: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
    checklist?: ChecklistItem[];
  }) => void;
  showAddModal: boolean;
  onCloseAddModal: () => void;
}

export default function TasksView({
  tasks,
  onToggleComplete,
  onDelete,
  onToggleChecklist,
  onAddLineItem,
  onAddTask,
  showAddModal,
  onCloseAddModal,
}: TasksViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "completed">("active");

  const activeCount = tasks.filter((t) => t.status !== "completed").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  const filtered = tasks.filter((t) => {
    const matchesStatus = filter === "active"
      ? t.status !== "completed"
      : t.status === "completed";
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignee?.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      t.job_name.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks, people, or jobs..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Toggle */}
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        <button
          onClick={() => setFilter("active")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center ${
            filter === "active"
              ? "bg-white text-orange-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Active
          <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">{activeCount}</span>
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors flex items-center justify-center ${
            filter === "completed"
              ? "bg-white text-orange-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Completed
          <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">{completedCount}</span>
        </button>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <ClipboardCheck className="h-10 w-10 text-slate-300" />
            <p className="text-slate-700 font-semibold">No {filter} tasks</p>
            <p className="text-slate-400 text-sm">
              {filter === "active"
                ? "Tap + to create your first task"
                : "Complete some tasks to see them here"}
            </p>
          </div>
        ) : (
          filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleComplete={onToggleComplete}
              onDelete={onDelete}
              onToggleChecklist={onToggleChecklist}
              onAddLineItem={onAddLineItem}
            />
          ))
        )}
      </div>

      {showAddModal && (
        <AddTaskModal onClose={onCloseAddModal} onAdd={onAddTask} />
      )}
    </div>
  );
}
