"use client";

// Realtime client (ADR-0012). Gets a 30-second single-use ticket from the app (which authorises each
// channel from the database), opens the WebSocket, and reconnects with backoff and a fresh ticket.
// Messages are hints only: callers re-read state over HTTP (onMessage / onReconnect), so a missed
// message is never lost data. If the realtime service is down, pages still work by normal refresh.
import { useEffect, useRef } from "react";

export interface RealtimeMessage {
  channel: string;
  body: { kind?: string } & Record<string, unknown>;
}

export function useRealtime(channels: string[], onMessage: (message: RealtimeMessage) => void, onReconnect?: () => void): void {
  const handlers = useRef({ onMessage, onReconnect });
  useEffect(() => {
    handlers.current = { onMessage, onReconnect };
  });
  const key = [...channels].sort().join(",");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectedOnce = false;

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(30_000, 1_000 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      attempt += 1;
      timer = setTimeout(connect, delay);
    };

    async function connect() {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(connect, 5_000);
        return;
      }
      try {
        const response = await fetch("/api/realtime/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channels: key ? key.split(",") : [] }) });
        if (!response.ok) return schedule();
        const { ticket, url } = (await response.json()) as { ticket: string; url: string };
        if (stopped) return;
        socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => {
          attempt = 0;
          if (connectedOnce) handlers.current.onReconnect?.();
          connectedOnce = true;
        };
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as { channel: string; body: string };
            if (data.channel === "system") return;
            handlers.current.onMessage({ channel: data.channel, body: JSON.parse(data.body) as RealtimeMessage["body"] });
          } catch {
            // ignore malformed messages
          }
        };
        socket.onclose = () => {
          socket = null;
          schedule();
        };
      } catch {
        schedule();
      }
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [key]);
}
