"use client";

import { useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format,
  isSameMonth, isSameDay, isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, X, Plus, CalendarDays } from "lucide-react";
import { Task, ChecklistItem } from "@/lib/types";
import AddTaskModal from "./AddTaskModal";

interface CalendarViewProps {
  tasks: Task[];
  onAddTask: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
    checklist?: ChecklistItem[];
  }) => void;
}

export default function CalendarView({ tasks, onAddTask }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const activeTasks = tasks.filter((t) => t.status === "active");

  const getTasksForDay = (day: Date) =>
    activeTasks.filter((t) => t.due_date && isSameDay(new Date(t.due_date + "T00:00:00"), day));

  const renderHeader = () => (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-all active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="text-base font-bold text-slate-900">
        {format(currentMonth, "MMMM yyyy")}
      </h2>
      <button
        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-all active:scale-90"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  const renderDays = () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      <div className="grid grid-cols-7 px-2 mb-1">
        {days.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-slate-400 uppercase">
            {d}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);

    const rows: React.ReactNode[] = [];
    let day = calStart;

    while (day <= calEnd) {
      const cells: React.ReactNode[] = [];
      for (let i = 0; i < 7; i++) {
        const d = day;
        const dayTasks = getTasksForDay(d);
        const inMonth = isSameMonth(d, monthStart);
        const today = isToday(d);

        cells.push(
          <button
            key={d.toISOString()}
            onClick={() => setSelectedDay(d)}
            className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl transition-all active:scale-95 ${
              !inMonth ? "text-slate-300" : "text-slate-700 hover:bg-slate-100"
            } ${today ? "bg-orange-50 font-bold" : ""} ${
              selectedDay && isSameDay(d, selectedDay) ? "ring-2 ring-orange-500 bg-orange-50" : ""
            }`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              today ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md" : 
              inMonth ? "text-slate-700" : "text-slate-300"
            }`}>
              {format(d, "d")}
            </span>
            {dayTasks.length === 1 && (
              <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 mt-1 shadow-sm" />
            )}
            {dayTasks.length > 1 && (
              <span className="text-[8px] font-bold text-orange-600 leading-none mt-1">{dayTasks.length}</span>
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toISOString()} className="grid grid-cols-7 gap-1 px-2">
          {cells}
        </div>
      );
    }

    return <div className="space-y-0.5">{rows}</div>;
  };

  const renderDayModal = () => {
    if (!selectedDay) return null;
    const dayTasks = getTasksForDay(selectedDay);

    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
        <div
          className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[60vh] overflow-y-auto animate-[slideUp_0.3s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-3 -mt-1">
            <div className="w-10 h-1 rounded-full bg-slate-200" />
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {format(selectedDay, "EEEE, MMM d")}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-orange-600/20 hover:shadow-lg hover:shadow-orange-600/30 transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {dayTasks.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50">
                <CalendarDays className="h-7 w-7 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-500">No tasks scheduled</p>
                <p className="text-xs text-slate-400 mt-0.5">Tap "Add Task" to schedule one</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {dayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 p-3.5 border border-slate-100 hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm" style={{
                    backgroundColor: task.priority === "Critical" ? "#dc2626" : task.priority === "High" ? "#f59e0b" : task.priority === "Medium" ? "#3b82f6" : "#94a3b8"
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                    <p className="text-xs text-slate-500">{task.assignee?.full_name ?? "Unassigned"} · {task.job_name}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    task.priority === "Critical" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-2">
      <div className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        {renderHeader()}
        {renderDays()}
        {renderCells()}
        <div className="h-2" />
      </div>

      {renderDayModal()}
      {showAddModal && selectedDay && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          onAdd={(task) => {
            onAddTask(task);
            setShowAddModal(false);
          }}
          initialDate={format(selectedDay, "yyyy-MM-dd")}
        />
      )}
    </div>
  );
}
