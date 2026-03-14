// supabase/functions/send-push-notification/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - npm specifier for Deno
import webpush from "npm:web-push";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") ?? "mailto:admin@protask.app";

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  // Verify webhook secret — required; fail closed if not configured
  const authHeader = req.headers.get("Authorization");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload: WebhookPayload = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let recipientUserIds: string[] = [];
  let notificationPayload: { title: string; body: string; url: string; tag: string } | null = null;

  if (payload.table === "chat_messages" && payload.type === "INSERT") {
    const record = payload.record;
    const companyId = record.company_id as string;
    const senderId = record.sender_id as string;

    // Get sender name
    const { data: sender } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", senderId)
      .single();

    // Get all active company members except the sender
    const { data: members } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .neq("id", senderId);

    recipientUserIds = (members ?? []).map((m: { id: string }) => m.id);
    const senderName = sender?.full_name ?? "Someone";
    const text = (record.text as string) ?? "";
    notificationPayload = {
      title: `💬 ${senderName}`,
      body: text.length > 80 ? text.slice(0, 80) + "…" : text,
      url: "/?tab=chat",
      tag: "chat-message",
    };
  } else if (payload.table === "tasks") {
    const record = payload.record;
    const oldRecord = payload.old_record;
    const assignedTo = record.assigned_to as string | null;

    if (!assignedTo) return new Response("No assignee", { status: 200 });

    const updatedBy = record.updated_by as string | null;

    if (payload.type === "INSERT" && assignedTo) {
      // New task assigned
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", record.created_by as string)
        .single();

      recipientUserIds = [assignedTo];
      notificationPayload = {
        title: "📋 New Task Assigned",
        body: `${creator?.full_name ?? "Someone"} assigned you: ${record.title}`,
        url: "/?tab=tasks",
        tag: `task-assigned-${record.id}`,
      };
    } else if (payload.type === "UPDATE") {
      const assigneeChanged = oldRecord?.assigned_to !== assignedTo;
      const editedBySomeoneElse = updatedBy && updatedBy !== assignedTo;

      if (assigneeChanged && assignedTo) {
        // Task reassigned to this user
        recipientUserIds = [assignedTo];
        notificationPayload = {
          title: "📋 Task Assigned to You",
          body: `You've been assigned: ${record.title}`,
          url: "/?tab=tasks",
          tag: `task-assigned-${record.id}`,
        };
      } else if (editedBySomeoneElse && assignedTo) {
        // Someone else updated the assignee's task
        const { data: editor } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", updatedBy!)
          .single();

        recipientUserIds = [assignedTo];
        notificationPayload = {
          title: "✏️ Task Updated",
          body: `${editor?.full_name ?? "Someone"} updated your task: ${record.title}`,
          url: "/?tab=tasks",
          tag: `task-updated-${record.id}`,
        };
      }
    }
  }

  if (!notificationPayload || recipientUserIds.length === 0) {
    return new Response("No notification needed", { status: 200 });
  }

  // Fetch push subscriptions for all recipients
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", recipientUserIds);

  if (!subscriptions || subscriptions.length === 0) {
    return new Response("No subscriptions", { status: 200 });
  }

  // Send push to all subscriptions
  const results = await Promise.allSettled(
    subscriptions.map((sub: { endpoint: string; p256dh: string; auth: string; user_id: string }) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(notificationPayload)
      ).catch(async (err: { statusCode?: number }) => {
        // 410 Gone = subscription expired, remove it
        if (err.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
        throw err;
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return new Response(JSON.stringify({ sent, total: subscriptions.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
