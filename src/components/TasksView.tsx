"use client";

import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import AddTaskModal from "./AddTaskModal";
import { useAuth } from "@/contexts/AuthContext";

interface TasksViewProps {
  tasks: Task[];
  onToggleComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
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
  isAdmin: boolean;
  showAddModal: boolean;
  onOpenAddModal: () => void;
  onCloseAddModal: () => void;
}

export default function TasksView({
  tasks,
  onToggleComplete,
  onDelete,
  onUpdateTask,
  onAddTask,
  isAdmin,
  showAddModal,
  onOpenAddModal,
  onCloseAddModal,
}: TasksViewProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Debounce search input (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Keep selectedTask in sync when parent tasks array is updated
  useEffect(() => {
    if (!selectedTask) return;
    const fresh = tasks.find((t) => t.id === selectedTask.id);
    if (fresh) setSelectedTask(fresh);
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTasks = tasks.filter((t) => {
    if (debouncedSearch === "") return true;
    const q = debouncedSearch.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.assignee?.full_name ?? "").toLowerCase().includes(q) ||
      t.job_name.toLowerCase().includes(q)
    );
  });

  const handleAddTask = (newTask: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
    checklist?: ChecklistItem[];
  }) => {
    onAddTask(newTask);
    onCloseAddModal();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all shrink-0"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </div>
        {/* Search result count */}
        {debouncedSearch && (
          <div className="mt-2 text-xs text-slate-500">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'} found
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
          {filteredTasks.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50">
                <Plus className="h-8 w-8 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">
                  {search ? "No tasks match your search" : "No tasks yet"}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  {search
                    ? "Try a different search term."
                    : "Tap New to create your first task."}
                </p>
              </div>
              {!search && (
                <button
                  onClick={onOpenAddModal}
                  className="mt-2 flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Create Task
                </button>
              )}
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={setSelectedTask}
                onToggleComplete={onToggleComplete}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          currentUserName={profile?.full_name ?? ""}
          isAdmin={isAdmin}
          onUpdate={onUpdateTask}
          onDelete={onDelete}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Add Task Modal */}
      {showAddModal && <AddTaskModal onClose={onCloseAddModal} onAdd={handleAddTask} />}
    </div>
  );
}
