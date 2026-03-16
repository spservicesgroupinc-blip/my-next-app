"use client";

import { useState, useEffect } from "react";
import { Search, LayoutGrid, List, Plus } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import AddTaskModal from "./AddTaskModal";
import KanbanBoard from "./KanbanBoard";
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
  onToggleChecklist,
  onAddLineItem,
  onAddTask,
  isAdmin,
  showAddModal,
  onOpenAddModal,
  onCloseAddModal,
}: TasksViewProps) {
  const { user, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Keep selectedTask in sync when parent tasks array is updated
  // (handles both optimistic updates and realtime subscription changes)
  useEffect(() => {
    if (!selectedTask) return;
    const fresh = tasks.find((t) => t.id === selectedTask.id);
    if (fresh) setSelectedTask(fresh);
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist view mode to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tasksViewMode") as "list" | "kanban" | null;
    if (saved) setView(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("tasksViewMode", view);
  }, [view]);

  // Wrapper for KanbanBoard that converts status to Task updates
  const handleUpdateStatus = (taskId: string, status: "active" | "in_progress" | "completed") => {
    onUpdateTask(taskId, { status });
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      search === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignee?.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      t.job_name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleOpenTask = (task: Task) => {
    setSelectedTask(task);
  };

  const handleCloseDrawer = () => {
    setSelectedTask(null);
  };

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
      <div className="flex-shrink-0 border-b border-slate-200 bg-white p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, people, or jobs..."
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                view === "list"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                view === "kanban"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Board
            </button>
          </div>
          <button
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "list" ? (
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
                      ? "Try a different search term or clear your filter."
                      : "Tap the + button to create your first task and get your team organized."}
                  </p>
                </div>
                {!search && (
                  <button
                    onClick={onOpenAddModal}
                    className="mt-2 flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 active:scale-95 transition-all"
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
                  onOpen={handleOpenTask}
                  onToggleComplete={onToggleComplete}
                  onDelete={onDelete}
                  onToggleChecklist={onToggleChecklist}
                  onAddLineItem={onAddLineItem}
                />
              ))
            )}
          </div>
        ) : (
          <KanbanBoard
            tasks={filteredTasks}
            onUpdateStatus={handleUpdateStatus}
            onOpenTask={handleOpenTask}
          />
        )}
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          currentUserName={profile?.full_name ?? ""}
          isAdmin={isAdmin}
          onUpdate={onUpdateTask}
          onDelete={onDelete}
          onClose={handleCloseDrawer}
        />
      )}

      {/* Add Task Modal */}
      {showAddModal && <AddTaskModal onClose={onCloseAddModal} onAdd={handleAddTask} />}
    </div>
  );
}
