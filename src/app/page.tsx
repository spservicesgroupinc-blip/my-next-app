"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import TasksView from "@/components/TasksView";
import TimeClockView from "@/components/TimeClockView";
import ChatView from "@/components/ChatView";
import CalendarView from "@/components/CalendarView";
import AdminView from "@/components/AdminView";
import InstallBanner from "@/components/InstallBanner";
import OfflineBanner from "@/components/OfflineBanner";
import { ToastProvider, useToast } from "@/components/Toast";
import { TabId, Task, TimeEntry, ChatMessage, ChecklistItem } from "@/lib/types";
import { useServiceWorker, useOnlineStatus, useInstallPrompt } from "@/lib/usePWA";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useLocationTracking } from "@/lib/useLocationTracking";

function HomeInner() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading, isAdmin } = useAuth();
  const supabase = createClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [showAddModal, setShowAddModal] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErrors, setDataErrors] = useState<{ tasks?: string; timeEntries?: string; chat?: string }>({});

  const isOnline = useOnlineStatus();
  useServiceWorker();
  const { canInstall, install } = useInstallPrompt();

  const { showToast } = useToast();

  // Track employee GPS location when clocked in
  const isClockedIn = timeEntries.some(
    (e) => e.user_id === user?.id && !e.clock_out
  );
  useLocationTracking(isClockedIn);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Load initial data
  useEffect(() => {
    if (!user) return;

    async function loadData() {
      setDataLoading(true);
      setDataErrors({});

      const [tasksRes, entriesRes, messagesRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("time_entries")
          .select("*")
          .order("clock_in", { ascending: false }),
        supabase
          .from("chat_messages")
          .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name)")
          .order("created_at", { ascending: true }),
      ]);

      const errors: typeof dataErrors = {};
      
      if (tasksRes.error) {
        console.error("Failed to load tasks:", tasksRes.error.message);
        errors.tasks = tasksRes.error.message;
      } else if (tasksRes.data) {
        setTasks(tasksRes.data as Task[]);
      }

      if (entriesRes.error) {
        console.error("Failed to load time entries:", entriesRes.error.message);
        errors.timeEntries = entriesRes.error.message;
      } else if (entriesRes.data) {
        setTimeEntries(entriesRes.data as TimeEntry[]);
      }

      if (messagesRes.error) {
        console.error("Failed to load messages:", messagesRes.error.message);
        errors.chat = messagesRes.error.message;
      } else if (messagesRes.data) {
        setChatMessages(messagesRes.data as ChatMessage[]);
      }

      setDataErrors(errors);
      setDataLoading(false);
    }

    loadData();

    // ── Real-time subscriptions ────────────────────────────────────────────────

    // Chat messages — listen for new messages from anyone
    const chatSub = supabase
      .channel("chat-messages-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          // Fetch the full message with sender profile
          const { data } = await supabase
            .from("chat_messages")
            .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setChatMessages((prev) => {
              // Avoid duplicates (optimistic update may already have added it)
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as ChatMessage];
            });
          }
        }
      )
      .subscribe();

    // Tasks — listen for inserts, updates, deletes
    const taskSub = supabase
      .channel("tasks-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        async (payload) => {
          const { data } = await supabase
            .from("tasks")
            .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setTasks((prev) => {
              if (prev.some((t) => t.id === data.id)) return prev;
              return [data as Task, ...prev];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        async (payload) => {
          const { data } = await supabase
            .from("tasks")
            .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setTasks((prev) =>
              prev.map((t) => (t.id === data.id ? (data as Task) : t))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tasks" },
        (payload) => {
          setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
        }
      )
      .subscribe();

    // Tab from URL
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabId | null;
    if (tab && ["tasks", "timeclock", "chat", "calendar", "admin"].includes(tab)) {
      setActiveTab(tab);
    }

    // Return cleanup to unsubscribe on unmount / user change
    return () => {
      supabase.removeChannel(chatSub);
      supabase.removeChannel(taskSub);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry data loading
  const retryDataLoad = useCallback(() => {
    setDataLoading(true);
    setTimeout(() => {
      // Trigger re-fetch by letting the effect run again
      window.location.reload();
    }, 100);
  }, []);

  // ── Task handlers ────────────────────────────────────────────────────────────

  const handleToggleComplete = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const newStatus = task.status === "completed" ? "active" : "completed";
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      await supabase
        .from("tasks")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId);
    },
    [tasks, supabase]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      await supabase.from("tasks").delete().eq("id", taskId);
      showToast("Task deleted", "info");
    },
    [supabase, showToast]
  );

  const handleToggleChecklist = useCallback(
    async (taskId: string, itemId: string) => {
      setTasks((prev) => {
        const updated = prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            checklist: t.checklist.map((c) =>
              c.id === itemId ? { ...c, completed: !c.completed } : c
            ),
          };
        });
        const updatedTask = updated.find((t) => t.id === taskId);
        if (updatedTask) {
          supabase
            .from("tasks")
            .update({
              checklist: updatedTask.checklist,
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskId);
        }
        return updated;
      });
    },
    [supabase]
  );

  const handleAddLineItem = useCallback(
    async (taskId: string, text: string) => {
      const newItem: ChecklistItem = {
        id: crypto.randomUUID(),
        text,
        completed: false,
      };
      setTasks((prev) => {
        const updated = prev.map((t) => {
          if (t.id !== taskId) return t;
          return { ...t, checklist: [...t.checklist, newItem] };
        });
        const updatedTask = updated.find((t) => t.id === taskId);
        if (updatedTask) {
          supabase
            .from("tasks")
            .update({
              checklist: updatedTask.checklist,
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskId);
        }
        return updated;
      });
    },
    [supabase]
  );

  const handleUpdateTask = useCallback(
    async (taskId: string, updates: Partial<Pick<Task, "title" | "job_name" | "due_date" | "priority" | "status" | "assigned_to" | "checklist">>) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      );
      const { error } = await supabase
        .from("tasks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) {
        console.error("Failed to update task:", error.message);
        showToast("Failed to save changes", "error");
      }
    },
    [supabase, showToast]
  );

  const handleAddTask = useCallback(
    async (task: {
      title: string;
      job_name: string;
      due_date: string;
      priority: "Low" | "Medium" | "High" | "Critical";
      assigned_to: string | null;
      checklist?: ChecklistItem[];
    }) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: task.title,
          job_name: task.job_name,
          due_date: task.due_date,
          priority: task.priority,
          assigned_to: task.assigned_to,
          status: "active",
          checklist: task.checklist || [],
          created_by: user.id,
          company_id: profile!.company_id,
        })
        .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
        .single();
      if (error) {
        console.error("Failed to add task:", error.message);
        showToast("Failed to create task", "error");
        return;
      }
      if (data) {
        setTasks((prev) => [data as Task, ...prev]);
        showToast("Task created", "success");
      }
    },
    [user, supabase, showToast]
  );

  // ── Time clock handlers ──────────────────────────────────────────────────────

  const handleClockIn = useCallback(
    async (jobName: string) => {
      if (!user || !profile) return;
      const { data, error } = await supabase
        .from("time_entries")
        .insert({
          user_id: user.id,
          job_name: jobName,
          clock_in: new Date().toISOString(),
          clock_out: null,
          hourly_rate: profile.hourly_rate,
          company_id: profile.company_id,
        })
        .select()
        .single();
      if (error) {
        console.error("Failed to clock in:", error.message);
        showToast("Failed to clock in", "error");
        return;
      }
      if (data) {
        setTimeEntries((prev) => [data as TimeEntry, ...prev]);
        showToast(`Clocked in — ${jobName}`, "success");
      }
    },
    [user, profile, supabase, showToast]
  );

  const handleClockOut = useCallback(
    async (entryId: string) => {
      const clockOut = new Date().toISOString();
      setTimeEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, clock_out: clockOut } : e))
      );
      showToast("Clocked out", "info");
      await supabase
        .from("time_entries")
        .update({ clock_out: clockOut })
        .eq("id", entryId);
    },
    [supabase, showToast]
  );

  // ── Chat handler ─────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ sender_id: user.id, text, company_id: profile!.company_id })
        .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name)")
        .single();
      if (error) {
        console.error("Failed to send message:", error.message);
        return;
      }
      if (data) {
        setChatMessages((prev) => [...prev, data as ChatMessage]);
      }
    },
    [user, supabase]
  );

  // ── Install handlers ─────────────────────────────────────────────────────────

  const handleInstall = async () => {
    await install();
    setInstallDismissed(true);
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 animate-pulse">
            <svg
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  // Show data error state if all data failed to load
  const allDataFailed = dataErrors.tasks && dataErrors.timeEntries && dataErrors.chat;
  const someDataFailed = Object.keys(dataErrors).length > 0;

  if (allDataFailed && !dataLoading) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 mx-auto mb-4">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Failed to Load Data</h2>
          <p className="text-sm text-slate-600 mb-4">
            We couldn&apos;t connect to the database. Please check your connection and try again.
          </p>
          <button
            onClick={retryDataLoad}
            className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const userInitials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex h-screen h-[100dvh] flex-col bg-slate-50">
      {!isOnline && <OfflineBanner />}

      {/* Data error banner for partial failures */}
      {someDataFailed && !allDataFailed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="flex items-center gap-2 text-amber-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs font-medium">
              Some data failed to load.{" "}
              <button onClick={retryDataLoad} className="underline hover:no-underline">
                Retry
              </button>
            </span>
          </div>
        </div>
      )}

      <Header
        activeTab={activeTab}
        userInitials={userInitials}
      />

      <main
        className={`flex-1 min-h-0 ${activeTab === "chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {activeTab === "tasks" && (
          <TasksView
            tasks={tasks}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDeleteTask}
            onToggleChecklist={handleToggleChecklist}
            onAddLineItem={handleAddLineItem}
            onUpdateTask={handleUpdateTask}
            isAdmin={isAdmin}
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
          <ChatView
            messages={chatMessages}
            onSend={handleSendMessage}
            currentUserId={user?.id ?? ""}
          />
        )}
        {activeTab === "calendar" && (
          <CalendarView tasks={tasks} onAddTask={handleAddTask} />
        )}
        {activeTab === "admin" && isAdmin && <AdminView />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} onAddTask={() => setShowAddModal(true)} isAdmin={isAdmin} />

      {canInstall && !installDismissed && (
        <InstallBanner onInstall={handleInstall} onDismiss={handleDismissInstall} />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <HomeInner />
    </ToastProvider>
  );
}
