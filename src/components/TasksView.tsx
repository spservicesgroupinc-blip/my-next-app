"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Task } from "@/lib/types";
import TaskCard from "./TaskCard";
import AddTaskModal from "./AddTaskModal";

interface TasksViewProps {
  tasks: Task[];
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleChecklist: (taskId: string, itemId: string) => void;
  onAddTask: (task: {
    title: string;
    assignedTo: string;
    jobName: string;
    dueDate: string;
    priority: "Low" | "Medium" | "High" | "Critical";
  }) => void;
  showAddModal: boolean;
  onCloseAddModal: () => void;
}

export default function TasksView({
  tasks,
  onToggleComplete,
  onDelete,
  onToggleChecklist,
  onAddTask,
  showAddModal,
  onCloseAddModal,
}: TasksViewProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"active" | "completed">("active");

  const filtered = tasks.filter((t) => {
    const matchesStatus = t.status === filter;
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assignedTo.toLowerCase().includes(search.toLowerCase()) ||
      t.jobName.toLowerCase().includes(search.toLowerCase());
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
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
            filter === "active"
              ? "bg-white text-orange-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
            filter === "completed"
              ? "bg-white text-orange-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Completed
        </button>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No {filter} tasks found.
          </div>
        ) : (
          filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleComplete={onToggleComplete}
              onDelete={onDelete}
              onToggleChecklist={onToggleChecklist}
            />
          ))
        )}
      </div>

      {showAddModal && <AddTaskModal onClose={onCloseAddModal} onAdd={onAddTask} />}
    </div>
  );
}
