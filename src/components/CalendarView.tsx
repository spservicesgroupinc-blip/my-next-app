"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { Task } from "@/lib/types";
import AddTaskModal from "./AddTaskModal";

interface CalendarViewProps {
  tasks: Task[];
  onAddTask: (task: {
    title: string;
    job_name: string;
    due_date: string;
    priority: "Low" | "Medium" | "High" | "Critical";
    assigned_to: string | null;
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
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h2 className="text-base font-bold text-slate-900">
        {format(currentMonth, "MMMM yyyy")}
      </h2>
      <button
        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
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
          <div key={d} className="py-1 text-center text-[10px] font-semibold text-slate-400 uppercase">
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
            className={`relative flex flex-col items-center justify-start py-1.5 rounded-lg transition-colors ${
              !inMonth ? "text-slate-300" : "text-slate-700 hover:bg-slate-100"
            } ${today ? "bg-orange-50 font-bold" : ""} ${
              selectedDay && isSameDay(d, selectedDay) ? "ring-2 ring-orange-500 bg-orange-50" : ""
            }`}
          >
            <span className={`text-xs ${today ? "text-orange-600" : ""}`}>
              {format(d, "d")}
            </span>
            {dayTasks.length > 0 && (
              <div className="flex gap-0.5 mt-0.5">
                {dayTasks.slice(0, 3).map((_, idx) => (
                  <div key={idx} className="h-1 w-1 rounded-full bg-orange-500" />
                ))}
              </div>
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toISOString()} className="grid grid-cols-7 gap-0.5 px-2">
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
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={() => setSelectedDay(null)}>
        <div
          className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[60vh] overflow-y-auto animate-[slideUp_0.3s_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">
              {format(selectedDay, "EEEE, MMM d")}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {dayTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No tasks due this day.</p>
          ) : (
            <div className="space-y-2">
              {dayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 border border-slate-100"
                >
                  <div className="h-2 w-2 rounded-full shrink-0" style={{
                    backgroundColor: task.priority === "Critical" ? "#dc2626" : task.priority === "High" ? "#f59e0b" : task.priority === "Medium" ? "#3b82f6" : "#94a3b8"
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                    <p className="text-xs text-slate-500">{task.assignee?.full_name ?? "Unassigned"} · {task.job_name}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        {renderHeader()}
        {renderDays()}
        {renderCells()}
        <div className="h-2" />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> Tasks due
        </span>
        <span className="flex items-center gap-1">
          <span className="h-4 w-4 rounded bg-orange-50 border border-orange-200" /> Today
        </span>
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
