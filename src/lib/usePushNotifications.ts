"use client";

import { useEffect, useRef } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications(userId: string | undefined) {
  const subscribedRef = useRef(false);
  const lastUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Reset subscription state when user changes (e.g., logout/login in same session)
    if (userId !== lastUserIdRef.current) {
      subscribedRef.current = false;
      lastUserIdRef.current = userId;
    }

    if (!userId || subscribedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("PushManager" in window) || !("serviceWorker" in navigator)) return;
    if (!("Notification" in window)) return;

    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!VAPID_PUBLIC_KEY) return;

    async function saveSubscription(sub: PushSubscription): Promise<boolean> {
      const json = sub.toJSON();
      try {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: json.keys,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function subscribe() {
      try {
        // Don't prompt if already denied
        if (Notification.permission === "denied") return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          const saved = await saveSubscription(existing);
          if (saved) subscribedRef.current = true;
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        });

        const saved = await saveSubscription(subscription);
        if (saved) subscribedRef.current = true;
      } catch (err) {
        console.error("Push subscription failed:", err);
      }
    }

    subscribe();
  }, [userId]);
}
