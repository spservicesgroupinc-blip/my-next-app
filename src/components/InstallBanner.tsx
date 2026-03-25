"use client";

import { Download, X } from "lucide-react";

interface InstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export default function InstallBanner({ onInstall, onDismiss }: InstallBannerProps) {
  return (
    <div className="fixed bottom-20 left-3 right-3 z-[60] animate-[slideUp_0.3s_ease-out]">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 shadow-2xl ring-1 ring-blue-600/20">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 animate-bounce">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Install DC FOAM</p>
          <p className="text-xs text-slate-400">Works offline · Faster · No app store needed</p>
        </div>
        <button
          onClick={onInstall}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-95"
        >
          Install
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 p-2 text-slate-500 hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
