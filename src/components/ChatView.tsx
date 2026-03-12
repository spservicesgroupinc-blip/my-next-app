"use client";

import { useState, useRef, useEffect } from "react";
import { Send, ImagePlus } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { currentUser } from "@/lib/data";

interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function ChatView({ messages, onSend }: ChatViewProps) {
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

  const avatarColors: Record<string, string> = {
    "Mike Johnson": "bg-blue-500",
    "Sarah Lee": "bg-purple-500",
    "Carlos Rivera": "bg-emerald-500",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.sender === currentUser.name;
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  avatarColors[msg.sender] || "bg-slate-500"
                }`}
              >
                {getInitials(msg.sender)}
              </div>
              <div className={`max-w-[75%] ${isMe ? "items-end" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold ${isMe ? "text-orange-600" : "text-slate-700"}`}>
                    {isMe ? "You" : msg.sender}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatTime(msg.timestamp)}</span>
                </div>
                <div
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    isMe
                      ? "bg-orange-600 text-white rounded-tr-sm"
                      : "bg-white text-slate-800 shadow-sm border border-slate-100 rounded-tl-sm"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 bg-white p-3">
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
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
