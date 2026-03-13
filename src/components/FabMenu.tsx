"use client";

import { useState, useEffect } from "react";
import { X, ClipboardList, Briefcase, Clock, Plus } from "lucide-react";

interface FabMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: () => void;
  onSelectJob: () => void;
  onSelectTime: () => void;
}

export default function FabMenu({ isOpen, onClose, onSelectTask, onSelectJob, onSelectTime }: FabMenuProps) {
  const [visible, setVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setVisible(false), 300);
      document.body.style.overflow = "";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!visible) return null;

  const menuItems = [
    {
      id: "task",
      label: "New Task",
      description: "Create a new task",
      icon: ClipboardList,
      color: "bg-orange-600",
      onClick: () => {
        onSelectTask();
        onClose();
      },
    },
    {
      id: "job",
      label: "New Job",
      description: "Add a new job",
      icon: Briefcase,
      color: "bg-blue-600",
      onClick: () => {
        onSelectJob();
        onClose();
      },
    },
    {
      id: "time",
      label: "Log Time",
      description: "Manually log time",
      icon: Clock,
      color: "bg-emerald-600",
      onClick: () => {
        onSelectTime();
        onClose();
      },
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[155] bg-slate-900/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Slide-out menu from right */}
      <div
        className={`fixed z-[160] top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Menu Items */}
        <div className="flex flex-col gap-3 p-5 pt-6">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`group flex w-full items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 text-left ${
                  isOpen ? "animate-[fadeInUp_0.3s_ease-out_forwards]" : ""
                }`}
                style={{
                  animationDelay: isOpen ? `${index * 0.08}s` : "0s",
                  animationFillMode: isOpen ? "forwards" : "none",
                }}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.color} text-white shadow-md group-hover:scale-110 transition-transform`}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-slate-900 group-hover:text-slate-700">
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 group-hover:bg-orange-50 transition-colors">
                  <Plus className="h-5 w-5 text-slate-400 group-hover:text-orange-600" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <p className="text-xs text-slate-400">Tap an option or press Esc to close</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
