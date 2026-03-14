# Push Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Web Push notifications for new chat messages and task events (assigned, updated), plus an unread message badge on the chat tab.

**Architecture:** Supabase DB Webhooks trigger a Supabase Edge Function on `chat_messages` INSERT and `tasks` INSERT/UPDATE. The Edge Function fetches push subscriptions from a `push_subscriptions` table and delivers pushes via the Web Push protocol (VAPID). The client subscribes on login and tracks unread chat count in-memory, reflected as a badge on the chat tab.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + Realtime + Edge Functions + DB Webhooks), web-push (npm package for Next.js API), npm:web-push in Deno Edge Function, existing Service Worker (sw.js already has push/notificationclick handlers).

---

### Task 1: Create push_subscriptions table

**Files:**
- No new files — run SQL via Supabase MCP

**Step 1: Run migration via Supabase MCP (execute_sql)**

```sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Step 2: Verify table exists**

Run: `SELECT table_name FROM information_schema.tables WHERE table_name = 'push_subscriptions';`
Expected: 1 row returned

**Step 3: Commit** (no local files changed — note the migration was applied)

---

### Task 2: Generate VAPID keys and configure environment

**Files:**
- Modify: `.env.local` (create if missing)

**Step 1: Install web-push globally to generate keys**

```bash
npx web-push generate-vapid-keys
```

Copy the output — it looks like:
```
Public Key: Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Step 2: Add to .env.local**

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<paste public key>
VAPID_PRIVATE_KEY=<paste private key>
VAPID_EMAIL=mailto:admin@protask.app
```

**Step 3: Add web-push npm package**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

**Step 4: Commit**

```bash
git add .env.local package.json package-lock.json
git commit -m "chore: add VAPID keys and web-push dependency"
```

> **Note:** `.env.local` is already in `.gitignore` — confirm before committing. If it is, commit only package.json and package-lock.json.

---

### Task 3: Create /api/push/subscribe API route

**Files:**
- Create: `src/app/api/push/subscribe/route.ts`

**Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      user_id: user.id,
      company_id: profile.company_id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    }, { onConflict: "user_id,endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await req.json();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
```

**Step 2: Commit**

```bash
git add src/app/api/push/subscribe/route.ts
git commit -m "feat: add push subscription API route"
```

---

### Task 4: Create usePushNotifications hook

**Files:**
- Create: `src/lib/usePushNotifications.ts`

**Step 1: Write the hook**

```typescript
"use client";

import { useEffect, useRef } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(userId: string | undefined) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userId || subscribedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("PushManager" in window) || !("serviceWorker" in navigator)) return;

    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!VAPID_PUBLIC_KEY) return;

    async function subscribe() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          // Already subscribed — ensure it's saved server-side
          await saveSubscription(existing);
          subscribedRef.current = true;
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        });

        await saveSubscription(subscription);
        subscribedRef.current = true;
      } catch (err) {
        console.error("Push subscription failed:", err);
      }
    }

    async function saveSubscription(sub: PushSubscription) {
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: json.keys,
        }),
      });
    }

    subscribe();
  }, [userId]);
}
```

**Step 2: Commit**

```bash
git add src/lib/usePushNotifications.ts
git commit -m "feat: add usePushNotifications hook with auto-subscribe"
```

---

### Task 5: Add push hook and unread badge state to page.tsx

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Import usePushNotifications and add unread state**

At the top of `page.tsx`, add import:
```typescript
import { usePushNotifications } from "@/lib/usePushNotifications";
```

Inside `HomeInner()`, after `const { user, profile, isLoading: authLoading, isAdmin } = useAuth();`, add:
```typescript
const [unreadChatCount, setUnreadChatCount] = useState(0);

// Auto-subscribe to push notifications after login
usePushNotifications(user?.id);
```

**Step 2: Clear unread count when chat tab is active**

Replace the existing `setActiveTab` call pattern — add an effect after the existing state declarations:
```typescript
// Clear unread chat count when user views chat tab
useEffect(() => {
  if (activeTab === "chat") {
    setUnreadChatCount(0);
  }
}, [activeTab]);
```

**Step 3: Increment unread count on new messages**

In the `chatSub` realtime handler (around line 130), after `setChatMessages((prev) => [...prev, data as ChatMessage]);`, add:
```typescript
// Increment unread badge if chat tab not active
setUnreadChatCount((prev) => (activeTab !== "chat" ? prev + 1 : 0));
```

Note: `activeTab` is captured in closure. Since the effect only re-runs on `[user]`, use a ref to track it:

Instead, add this ref near the other state:
```typescript
const activeTabRef = useRef<TabId>("tasks");
```

Update `activeTabRef` whenever tab changes — wrap `setActiveTab`:
```typescript
const handleTabChange = useCallback((tab: TabId) => {
  setActiveTab(tab);
  activeTabRef.current = tab;
  if (tab === "chat") setUnreadChatCount(0);
}, []);
```

Then in the realtime handler, replace `activeTab !== "chat"` with `activeTabRef.current !== "chat"`.

**Step 4: Pass unreadChatCount to BottomNav and update tab change call**

Find the `<BottomNav>` JSX render and update it:
```tsx
<BottomNav
  activeTab={activeTab}
  onTabChange={handleTabChange}
  onAddTask={() => setShowFabMenu(true)}
  isAdmin={isAdmin}
  unreadChatCount={unreadChatCount}
/>
```

Also find any direct `onTabChange={setActiveTab}` calls passed elsewhere and update to `handleTabChange`.

**Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add unread chat badge state and push hook integration"
```

---

### Task 6: Update BottomNav to show chat badge

**Files:**
- Modify: `src/components/BottomNav.tsx`

**Step 1: Add unreadChatCount prop to interface**

```typescript
interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddTask: () => void;
  isAdmin?: boolean;
  unreadChatCount?: number;
}
```

Update component signature:
```typescript
export default function BottomNav({ activeTab, onTabChange, onAddTask, isAdmin, unreadChatCount = 0 }: BottomNavProps) {
```

**Step 2: Add badge to the renderTab function**

Replace the existing `renderTab` function with this version that adds a badge for the chat tab:

```typescript
const renderTab = (tab: { id: TabId; label: string; icon: React.ElementType }) => {
  const Icon = tab.icon;
  const isActive = activeTab === tab.id;
  const isAdminTab = tab.id === "admin";
  const activeColor = isAdminTab ? "text-blue-600" : "text-orange-600";
  const showBadge = tab.id === "chat" && unreadChatCount > 0;

  return (
    <button
      key={tab.id}
      onClick={() => onTabChange(tab.id)}
      className={`relative flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-2 transition-all duration-150 ${
        isActive ? activeColor : "text-slate-400 hover:text-slate-600"
      }`}
    >
      {isActive && (
        <span className="absolute top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-current" />
      )}
      <div className="relative">
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        {showBadge && (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-0.5 text-[9px] font-bold leading-none text-white">
            {unreadChatCount > 99 ? "99+" : unreadChatCount}
          </span>
        )}
      </div>
      <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : "font-medium"}`}>
        {tab.label}
      </span>
    </button>
  );
};
```

**Step 3: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: add unread message badge to chat tab in BottomNav"
```

---

### Task 7: Create Supabase Edge Function for push delivery

**Files:**
- Create: `supabase/functions/send-push-notification/index.ts`

**Step 1: Create directory and file**

```bash
mkdir -p supabase/functions/send-push-notification
```

**Step 2: Write the Edge Function**

```typescript
// supabase/functions/send-push-notification/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore - npm specifier
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
  // Verify webhook secret
  const authHeader = req.headers.get("Authorization");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload: WebhookPayload = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let recipientUserIds: string[] = [];
  let notificationPayload: { title: string; body: string; url: string } | null = null;

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

    // Get all company members except the sender
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
```

**Step 3: Commit**

```bash
git add supabase/functions/send-push-notification/index.ts
git commit -m "feat: add send-push-notification Edge Function"
```

---

### Task 8: Deploy Edge Function and set secrets

**Step 1: Deploy via Supabase MCP (deploy_edge_function)**

Use `mcp__supabase__deploy_edge_function` with:
- project_id: `thwdaicnysqgjszcndkl`
- name: `send-push-notification`
- entrypoint_path: `supabase/functions/send-push-notification/index.ts`

**Step 2: Set Edge Function secrets via Supabase dashboard or CLI**

The following secrets must be set (Supabase dashboard → Edge Functions → send-push-notification → Secrets):
- `VAPID_PUBLIC_KEY` — the public key from Task 2
- `VAPID_PRIVATE_KEY` — the private key from Task 2
- `VAPID_EMAIL` — `mailto:admin@protask.app`
- `WEBHOOK_SECRET` — generate a random string: `openssl rand -hex 32`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by Supabase.

**Step 3: Note the Edge Function URL**

It will be: `https://thwdaicnysqgjszcndkl.supabase.co/functions/v1/send-push-notification`

---

### Task 9: Set up Supabase DB Webhooks

**Step 1: Create webhook for chat_messages**

In Supabase dashboard → Database → Webhooks → Create new:
- Name: `on-new-chat-message`
- Table: `public.chat_messages`
- Events: `INSERT`
- URL: `https://thwdaicnysqgjszcndkl.supabase.co/functions/v1/send-push-notification`
- HTTP Headers: `Authorization: Bearer <WEBHOOK_SECRET>`

**Step 2: Create webhook for tasks**

- Name: `on-task-change`
- Table: `public.tasks`
- Events: `INSERT`, `UPDATE`
- URL: `https://thwdaicnysqgjszcndkl.supabase.co/functions/v1/send-push-notification`
- HTTP Headers: `Authorization: Bearer <WEBHOOK_SECRET>`

**Step 3: Test by sending a chat message and verifying Edge Function logs**

In Supabase dashboard → Edge Functions → send-push-notification → Logs

---

### Task 10: Verify service worker push handler handles tag deduplication

**Files:**
- Modify: `public/sw.js`

**Step 1: Update the push handler to add a `tag` for deduplication**

The existing push handler works, but update it to use `tag` to prevent duplicate notifications if multiple messages arrive quickly:

```javascript
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'ProTask', body: 'You have a new notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      actions: data.actions || [],
      tag: data.tag || 'protask-notification',
      renotify: true,
    })
  );
});
```

**Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat: add tag and renotify to push notification handler"
```

---

### Task 11: End-to-end smoke test

1. Open app in Chrome (desktop or Android)
2. Log in — observe browser notification permission prompt appears
3. Grant permission
4. From a second account (or Supabase dashboard), insert a row into `chat_messages` with a different `sender_id`
5. Verify: push notification appears on the first user's device
6. Verify: when app is in foreground on a non-chat tab, the chat badge shows a count
7. Switch to chat tab — verify badge clears
8. Create a task assigned to the logged-in user from a different account
9. Verify: "New Task Assigned" push notification appears

---

### Notes

- **iOS:** Push only works in Safari when the app is added to Home Screen. The permission prompt will still show in-browser on iOS 16.4+ PWA context, but silently fails in regular Safari tab — this is expected behavior.
- **VAPID keys:** Never commit private keys to git. They live only in `.env.local` (gitignored) and Supabase Edge Function secrets.
- **Stale subscriptions:** The Edge Function automatically removes subscriptions that return HTTP 410 (subscription expired/revoked).
