"use client";

import { create } from "zustand";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
};

type Store = {
  messages: ChatMessage[];
  avatarLoaded: boolean;
  setAvatarLoaded: (v: boolean) => void;
  ttsEnabled: boolean;
  setTTSEnabled: (v: boolean) => void;
  addMessage: (m: Omit<ChatMessage, "id" | "ts"> & { id?: string; ts?: number }) => void;
  clear: () => void;
};

export const useStore = create<Store>((set) => ({
  messages: [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Hi! I’m Setsuna. Ask me about anime!",
      ts: Date.now(),
    },
  ],
  avatarLoaded: false,
  setAvatarLoaded: (v) => set({ avatarLoaded: v }),
  ttsEnabled: false,
  setTTSEnabled: (v) => set({ ttsEnabled: v }),
  addMessage: (m) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: m.id ?? crypto.randomUUID(), ts: m.ts ?? Date.now(), role: m.role, text: m.text },
      ],
    })),
  clear: () => set({ messages: [] }),
}));
