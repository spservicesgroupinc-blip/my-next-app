"use client";

import { useState, useRef, useEffect } from "react";
import { Send, MessageCircle, ImagePlus, X, Loader2 } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { useAuth } from "@/contexts/AuthContext";

interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentUserId: string;
  onSendImage: (imageUrl: string, text?: string) => Promise<void>;
  companyId: string;
}

export default function ChatView({ messages, onSend, currentUserId, onSendImage, companyId }: ChatViewProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { profile } = useAuth();
  const { uploadPhoto, uploading: imageUploading, error: imageError } = usePhotoUpload("chat-images");
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pendingImageName, setPendingImageName] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    const result = await uploadPhoto(file, companyId, `chat-${crypto.randomUUID()}`, profile.id);
    if (result) {
      setPendingImageUrl(result.publicUrl);
      setPendingImageName(file.name);
    }
  };

  const handleSendWithImage = async () => {
    if (!pendingImageUrl) return;
    await onSendImage(pendingImageUrl, input.trim() || undefined);
    setPendingImageUrl(null);
    setPendingImageName("");
    setInput("");
  };

  const handleSend = () => {
    if (pendingImageUrl) {
      handleSendWithImage();
      return;
    }
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
      "bg-gradient-to-br from-violet-500 to-violet-600",
      "bg-gradient-to-br from-blue-500 to-blue-600",
      "bg-gradient-to-br from-emerald-500 to-emerald-600",
      "bg-gradient-to-br from-amber-500 to-amber-600",
      "bg-gradient-to-br from-pink-500 to-pink-600",
      "bg-gradient-to-br from-cyan-500 to-cyan-600",
      "bg-gradient-to-br from-indigo-500 to-indigo-600",
      "bg-gradient-to-br from-rose-500 to-rose-600",
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
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50">
              <MessageCircle className="h-8 w-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Start a conversation with your team. Type a message below to get things going.</p>
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
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-white px-2 py-0.5 rounded-full">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                  </div>
                )}
                <div className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ${
                      isMe ? "bg-gradient-to-br from-blue-600 to-blue-900" : getAvatarColor(senderName)
                    }`}
                  >
                    {getInitials(senderName)}
                  </div>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold ${
                          isMe ? "text-blue-600" : "text-slate-700"
                        }`}
                      >
                        {isMe ? "You" : senderName}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(msg.created_at)}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                        isMe
                          ? "bg-gradient-to-br from-blue-600 to-blue-900 text-white rounded-tr-sm"
                          : "bg-white text-slate-800 border border-slate-100 rounded-tl-sm hover:shadow-md transition-shadow"
                      }`}
                    >
                      {msg.text}
                      {msg.image_url && (
                        <div className="mt-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.image_url}
                            alt="Shared image"
                            className="max-w-[240px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(msg.image_url!, "_blank")}
                          />
                        </div>
                      )}
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
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur-sm">
        {imageError && <p className="text-xs text-red-500 px-4 pb-1">{imageError}</p>}
        {pendingImageUrl && (
          <div className="px-4 py-2 flex items-center gap-2 bg-blue-50 border-t border-blue-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImageUrl} alt="preview" className="h-12 w-12 rounded-lg object-cover border border-blue-200 flex-shrink-0" />
            <span className="text-xs text-blue-600 flex-1 truncate">{pendingImageName}</span>
            <button
              onClick={() => { setPendingImageUrl(null); setPendingImageName(""); }}
              className="p-1 text-blue-400 hover:text-blue-600 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUploading}
              className="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors flex-shrink-0"
              title="Send image"
            >
              {imageUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() && !pendingImageUrl}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-900 text-white shadow-md shadow-blue-600/30 transition-all hover:shadow-lg hover:shadow-blue-600/40 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
