"use client";

import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineBanner() {
  // This component is only mounted when offline.
  // We track if we've come back online to show a "back online" flash.
  const [backOnline, setBackOnline] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      setBackOnline(true);
      // Auto-dismiss after 2.5 seconds
      setTimeout(() => setVisible(false), 2500);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  if (!visible) return null;

  if (backOnline) {
    return (
      <div className="sticky top-0 z-[70] flex items-center justify-center gap-2 bg-emerald-500 px-4 py-1.5 animate-[slideDown_0.3s_ease-out]">
        <Wifi className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Back online</span>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-[70] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2">
      <WifiOff className="h-3.5 w-3.5 text-white animate-pulse" />
      <span className="text-xs font-semibold text-white">You&apos;re offline — data saved locally</span>
    </div>
  );
}
