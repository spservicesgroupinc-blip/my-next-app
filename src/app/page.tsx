"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import TasksView from "@/components/TasksView";
import TimeClockView from "@/components/TimeClockView";
import ChatView from "@/components/ChatView";
import CalendarView from "@/components/CalendarView";
import InstallBanner from "@/components/InstallBanner";
import OfflineBanner from "@/components/OfflineBanner";
import { TabId, Task, TimeEntry, ChatMessage } from "@/lib/types";
import { useServiceWorker, useOnlineStatus, useInstallPrompt } from "@/lib/usePWA";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading } = useAuth();
  const supabase = createClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [showAddModal, setShowAddModal] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const isOnline = useOnlineStatus();
  useServiceWorker();
  const { canInstall, install } = useInstallPrompt();

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

      if (tasksRes.data) setTasks(tasksRes.data as Task[]);
      if (entriesRes.data) setTimeEntries(entriesRes.data as TimeEntry[]);
      if (messagesRes.data) setChatMessages(messagesRes.data as ChatMessage[]);

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
    if (tab && ["tasks", "timeclock", "chat", "calendar"].includes(tab)) {
      setActiveTab(tab);
    }

    // Return cleanup to unsubscribe on unmount / user change
    return () => {
      supabase.removeChannel(chatSub);
      supabase.removeChannel(taskSub);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
    },
    [supabase]
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

  const handleAddTask = useCallback(
    async (task: {
      title: string;
      job_name: string;
      due_date: string;
      priority: "Low" | "Medium" | "High" | "Critical";
      assigned_to: string | null;
    }) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          ...task,
          status: "active",
          checklist: [],
          created_by: user.id,
        })
        .select("*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)")
        .single();
      if (!error && data) {
        setTasks((prev) => [data as Task, ...prev]);
      }
    },
    [user, supabase]
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
        })
        .select()
        .single();
      if (!error && data) {
        setTimeEntries((prev) => [data as TimeEntry, ...prev]);
      }
    },
    [user, profile, supabase]
  );

  const handleClockOut = useCallback(
    async (entryId: string) => {
      const clockOut = new Date().toISOString();
      setTimeEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, clock_out: clockOut } : e))
      );
      await supabase
        .from("time_entries")
        .update({ clock_out: clockOut })
        .eq("id", entryId);
    },
    [supabase]
  );

  // ── Chat handler ─────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ sender_id: user.id, text })
        .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name)")
        .single();
      if (!error && data) {
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

  if (authLoading || dataLoading) {
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

  const userInitials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-slate-50">
      {!isOnline && <OfflineBanner />}

      <Header
        activeTab={activeTab}
        onAddTask={() => setShowAddModal(true)}
        userInitials={userInitials}
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
          <ChatView
            messages={chatMessages}
            onSend={handleSendMessage}
            currentUserId={user?.id ?? ""}
          />
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
