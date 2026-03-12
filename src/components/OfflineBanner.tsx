"use client";

import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  return (
    <div className="sticky top-0 z-[70] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5">
      <WifiOff className="h-3.5 w-3.5 text-white" />
      <span className="text-xs font-semibold text-white">You&apos;re offline — data saved locally</span>
    </div>
  );
}
