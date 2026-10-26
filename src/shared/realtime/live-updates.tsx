"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

import { useRealtime } from "./use-realtime";

/**
 * Refreshes the server-rendered page when a message of one of the given kinds arrives on the user's
 * own channel or the listed channels (debounced), and after a reconnect (to catch up on missed hints).
 */
export function LiveUpdates({ channels, refreshOn }: { channels: string[]; refreshOn: string[] }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), 300);
  };
  useRealtime(channels, (message) => {
    if (message.body.kind && refreshOn.includes(message.body.kind)) refresh();
  }, refresh);
  return null;
}
