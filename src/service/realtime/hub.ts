// Realtime delivery (ADR-0012). Browsers connect to /ws with a short-lived signed ticket issued by the
// app (30 s, single use: its nonce is consumed with SET NX). A connection only receives the channels
// named in its ticket, which the app authorised from the database. Messages are hints ("something
// changed"); clients re-read state over HTTP, so a lost message only delays an update.
// Redis (Valkey) fans messages out between service instances; when it is unavailable the hub falls back
// to in-process delivery and an in-memory nonce set (single instance), never blocking the worker.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { Redis } from "ioredis";
import { WebSocket, WebSocketServer } from "ws";

import { TICKET_TTL_SECONDS, verifyTicket } from "@/shared/security/realtime-ticket";

const DEFAULT_PREFIX = "rt:";
const MAX_CLIENTS_PER_USER = 10;
const MAX_TOTAL_CLIENTS = 5000;

interface Client {
  socket: WebSocket;
  userId: string;
  channels: Set<string>;
  alive: boolean;
}

export interface RealtimeHub {
  publish(channel: string, body: string): Promise<void>;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  stats(): { clients: number; redis: boolean };
  close(): Promise<void>;
}

export function createRealtimeHub(options: { redisUrl: string; allowedOrigin: string; log: (message: string) => void; keyPrefix?: string }): RealtimeHub {
  // Separate key spaces let several local services share one Valkey (e.g. development and E2E).
  const PREFIX = options.keyPrefix ?? DEFAULT_PREFIX;
  const clients = new Set<Client>();
  const usedNonces = new Map<string, number>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  let redisUp = false;

  const redisOptions = { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: (times: number) => Math.min(times * 500, 10_000) };
  const pub = new Redis(options.redisUrl, redisOptions);
  const sub = new Redis(options.redisUrl, redisOptions);
  for (const [name, conn] of [["publisher", pub], ["subscriber", sub]] as const) {
    conn.on("error", () => undefined); // reported through the ready/close events below
    conn.on("ready", () => {
      if (name === "subscriber") void sub.psubscribe(`${PREFIX}*`).catch(() => undefined);
      redisUp = pub.status === "ready" && sub.status === "ready";
      options.log(`redis ${name} ready`);
    });
    conn.on("close", () => {
      if (redisUp) options.log(`redis ${name} disconnected; using in-process delivery`);
      redisUp = false;
    });
  }
  void pub.connect().catch(() => options.log("redis unavailable; using in-process delivery"));
  void sub.connect().catch(() => undefined);

  const deliver = (channel: string, body: string) => {
    for (const client of clients) if (client.channels.has(channel) && client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify({ channel, body }));
  };
  sub.on("pmessage", (_pattern, channel, body) => deliver(channel.slice(PREFIX.length), body));

  async function consumeNonce(nonce: string): Promise<boolean> {
    if (redisUp) {
      try {
        return (await pub.set(`${PREFIX}nonce:${nonce}`, "1", "EX", TICKET_TTL_SECONDS * 2, "NX")) === "OK";
      } catch {
        // fall through to the in-memory set
      }
    }
    const now = Date.now();
    for (const [key, expires] of usedNonces) if (expires < now) usedNonces.delete(key);
    if (usedNonces.has(nonce)) return false;
    usedNonces.set(nonce, now + TICKET_TTL_SECONDS * 2000);
    return true;
  }

  const refuse = (socket: Duplex, status: number) => {
    socket.write(`HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Service Unavailable"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    async publish(channel, body) {
      if (redisUp) {
        try {
          await pub.publish(`${PREFIX}${channel}`, body);
          return;
        } catch {
          // fall back to local delivery
        }
      }
      deliver(channel, body);
    },
    handleUpgrade(request, socket, head) {
      void (async () => {
        // Cross-site WebSocket hijacking: only the app's own origin may connect.
        if (request.headers.origin !== options.allowedOrigin) return refuse(socket, 403);
        const url = new URL(request.url ?? "/", "http://localhost");
        const claims = verifyTicket(url.searchParams.get("ticket") ?? "");
        if (!claims || !(await consumeNonce(claims.nonce))) return refuse(socket, 401);
        if (clients.size >= MAX_TOTAL_CLIENTS || [...clients].filter((c) => c.userId === claims.sub).length >= MAX_CLIENTS_PER_USER) return refuse(socket, 503);
        wss.handleUpgrade(request, socket, head, (ws) => {
          const client: Client = { socket: ws, userId: claims.sub, channels: new Set(claims.channels), alive: true };
          clients.add(client);
          ws.on("pong", () => (client.alive = true));
          // The protocol is server-to-client only; anything the browser sends is ignored.
          ws.on("message", () => undefined);
          ws.on("close", () => clients.delete(client));
          ws.on("error", () => clients.delete(client));
          ws.send(JSON.stringify({ channel: "system", body: JSON.stringify({ kind: "ready", channels: [...client.channels] }) }));
        });
      })().catch(() => refuse(socket, 503));
    },
    stats: () => ({ clients: clients.size, redis: redisUp }),
    async close() {
      clearInterval(heartbeat);
      for (const client of clients) client.socket.terminate();
      wss.close();
      pub.disconnect();
      sub.disconnect();
    },
  };
}
