"use client";

import { useState, useEffect } from "react";
import { ClipboardList, Briefcase, Clock } from "lucide-react";

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
    } else {
      const timer = setTimeout(() => setVisible(false), 300);
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
      icon: ClipboardList,
      color: "bg-blue-600 hover:bg-blue-700",
      onClick: () => {
        onSelectTask();
        onClose();
      },
    },
    {
      id: "job",
      label: "New Job",
      icon: Briefcase,
      color: "bg-blue-600 hover:bg-blue-700",
      onClick: () => {
        onSelectJob();
        onClose();
      },
    },
    {
      id: "time",
      label: "Log Time",
      icon: Clock,
      color: "bg-emerald-600 hover:bg-emerald-700",
      onClick: () => {
        onSelectTime();
        onClose();
      },
    },
  ];

  return (
    <>
      {/* Backdrop - subtle overlay */}
      <div
        className={`fixed inset-0 z-[155] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Slide-up menu from bottom */}
      <div
        className={`fixed z-[160] bottom-20 left-1/2 -translate-x-1/2 w-[280px] bg-white shadow-2xl rounded-2xl border border-slate-100 transition-all duration-300 ease-out ${
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Menu Items */}
        <div className="flex flex-col gap-2 p-3">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`group flex items-center gap-3 rounded-xl ${item.color} text-white p-3.5 shadow-sm transition-all duration-200 ${
                  isOpen ? "animate-[fadeInUp_0.25s_ease-out_forwards]" : ""
                }`}
                style={{
                  animationDelay: isOpen ? `${index * 0.05}s` : "0s",
                  animationFillMode: isOpen ? "forwards" : "none",
                }}
              >
                <Icon className="h-5 w-5" strokeWidth={2.5} />
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>


    </>
  );
}
