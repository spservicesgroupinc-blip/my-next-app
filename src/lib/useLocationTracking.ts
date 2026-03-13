"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const SEND_INTERVAL = 30_000; // 30 seconds

/**
 * Watches the employee's GPS position and sends it to the server
 * every 30 seconds while they are clocked in.
 */
export function useLocationTracking(isClockedIn: boolean) {
  const { user } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPosition = useRef<{ latitude: number; longitude: number; accuracy: number } | null>(null);

  const sendLocation = useCallback(async () => {
    if (!latestPosition.current || !user) return;
    try {
      await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latestPosition.current),
      });
    } catch {
      // Silently fail — will retry next interval
    }
  }, [user]);

  useEffect(() => {
    if (!isClockedIn || !user || !("geolocation" in navigator)) return;

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPosition.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
      },
      () => {
        // Permission denied or error — nothing to do
      },
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );

    // Send immediately once we get a position
    const initialTimeout = setTimeout(() => sendLocation(), 2_000);

    // Then send every 30 seconds
    intervalRef.current = setInterval(sendLocation, SEND_INTERVAL);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isClockedIn, user, sendLocation]);
}
