"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import TasksView from "@/components/TasksView";
import TimeClockView from "@/components/TimeClockView";
import ChatView from "@/components/ChatView";
import CalendarView from "@/components/CalendarView";
import InstallBanner from "@/components/InstallBanner";
import OfflineBanner from "@/components/OfflineBanner";
import { TabId, Task, TimeEntry, ChatMessage } from "@/lib/types";
import { mockTasks, mockTimeEntries, mockChatMessages, currentUser } from "@/lib/data";
import { useServiceWorker, useOnlineStatus, useInstallPrompt } from "@/lib/usePWA";

const STORAGE_KEYS = {
  tasks: "protask_tasks",
  timeEntries: "protask_time_entries",
  chatMessages: "protask_chat_messages",
  activeTab: "protask_active_tab",
  installDismissed: "protask_install_dismissed",
};

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable
  }
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [showAddModal, setShowAddModal] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const isOnline = useOnlineStatus();
  useServiceWorker();
  const { canInstall, install } = useInstallPrompt();

  // Hydrate state from localStorage
  useEffect(() => {
    setTasks(loadFromStorage(STORAGE_KEYS.tasks, mockTasks));
    setTimeEntries(loadFromStorage(STORAGE_KEYS.timeEntries, mockTimeEntries));
    setChatMessages(loadFromStorage(STORAGE_KEYS.chatMessages, mockChatMessages));
    setActiveTab(loadFromStorage(STORAGE_KEYS.activeTab, "tasks"));
    setInstallDismissed(loadFromStorage(STORAGE_KEYS.installDismissed, false));
    setHydrated(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.tasks, tasks);
  }, [tasks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.timeEntries, timeEntries);
  }, [timeEntries, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.chatMessages, chatMessages);
  }, [chatMessages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(STORAGE_KEYS.activeTab, activeTab);
  }, [activeTab, hydrated]);

  // Tab from URL query on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabId | null;
    if (tab && ["tasks", "timeclock", "chat", "calendar"].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Task handlers
  const handleToggleComplete = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === "completed" ? "active" : "completed" }
          : t
      )
    );
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const handleToggleChecklist = useCallback((taskId: string, itemId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              checklist: t.checklist.map((c) =>
                c.id === itemId ? { ...c, completed: !c.completed } : c
              ),
            }
          : t
      )
    );
  }, []);

  const handleAddTask = useCallback(
    (task: {
      title: string;
      assignedTo: string;
      jobName: string;
      dueDate: string;
      priority: "Low" | "Medium" | "High" | "Critical";
    }) => {
      const newTask: Task = {
        id: `task_${Date.now()}`,
        ...task,
        status: "active",
        checklist: [],
      };
      setTasks((prev) => [newTask, ...prev]);
    },
    []
  );

  // Time clock handlers
  const handleClockIn = useCallback((jobName: string) => {
    const entry: TimeEntry = {
      id: `te_${Date.now()}`,
      jobName,
      clockIn: new Date().toISOString(),
      clockOut: null,
      hourlyRate: currentUser.hourlyRate,
    };
    setTimeEntries((prev) => [entry, ...prev]);
  }, []);

  const handleClockOut = useCallback((entryId: string) => {
    setTimeEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, clockOut: new Date().toISOString() } : e
      )
    );
  }, []);

  // Chat handler
  const handleSendMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: currentUser.name,
      text,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  // Install handlers
  const handleInstall = async () => {
    await install();
    setInstallDismissed(true);
    saveToStorage(STORAGE_KEYS.installDismissed, true);
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    saveToStorage(STORAGE_KEYS.installDismissed, true);
  };

  // Loading skeleton
  if (!hydrated) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 animate-pulse">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-slate-50">
      {!isOnline && <OfflineBanner />}

      <Header
        activeTab={activeTab}
        onAddTask={() => setShowAddModal(true)}
        userInitials={currentUser.initials}
      />

      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === "tasks" && (
          <TasksView
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDeleteTask}
            onToggleChecklist={handleToggleChecklist}
            onAddTask={handleAddTask}
            showAddModal={showAddModal}
            onCloseAddModal={() => setShowAddModal(false)}
          />
        )}
        {activeTab === "timeclock" && (
          <TimeClockView
            timeEntries={timeEntries}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
          />
        )}
        {activeTab === "chat" && (
          <ChatView messages={chatMessages} onSend={handleSendMessage} />
        )}
        {activeTab === "calendar" && (
          <CalendarView tasks={tasks} onAddTask={handleAddTask} />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {canInstall && !installDismissed && (
        <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstall} />
      )}
    </div>
  );
}
