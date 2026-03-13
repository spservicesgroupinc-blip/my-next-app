"use client";

import { useState, useRef, useEffect } from "react";
import { Send, ImagePlus, MessageCircle } from "lucide-react";
import { ChatMessage } from "@/lib/types";

interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentUserId: string;
}

export default function ChatView({ messages, onSend, currentUserId }: ChatViewProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

  const getAvatarColor = (name: string): string => {
    const colors = [
      "bg-violet-500",
      "bg-blue-500",
      "bg-emerald-500",
      "bg-amber-500",
      "bg-pink-500",
      "bg-cyan-500",
      "bg-indigo-500",
      "bg-rose-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const formatDateSeparator = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <MessageCircle className="h-8 w-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">No messages yet</p>
              <p className="text-xs text-slate-400 mt-0.5">Say hi to your team!</p>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === currentUserId;
            const senderName = msg.sender?.full_name ?? "Unknown";
            const showDateSep =
              index === 0 ||
              new Date(msg.created_at).toDateString() !==
                new Date(messages[index - 1].created_at).toDateString();

            return (
              <div key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                )}
                <div className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      isMe ? "bg-orange-600" : getAvatarColor(senderName)
                    }`}
                  >
                    {getInitials(senderName)}
                  </div>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : ""}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-xs font-semibold ${
                          isMe ? "text-orange-600" : "text-slate-700"
                        }`}
                      >
                        {isMe ? "You" : senderName}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(msg.created_at)}</span>
                    </div>
                    <div
                      className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        isMe
                          ? "bg-orange-600 text-white rounded-tr-sm"
                          : "bg-white text-slate-800 shadow-sm border border-slate-100 rounded-tl-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <ImagePlus className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-white shadow-md transition-all hover:bg-orange-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
