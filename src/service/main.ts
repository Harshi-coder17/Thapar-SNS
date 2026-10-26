// The background service (ADR-0004, ADR-0012): outbox worker, signed nudge endpoint, 5-minute sweep,
// scheduled jobs and the realtime WebSocket server, in one long-running process.
// Run with `npm run service` (tsx, react-server conditions, .env loaded). Binds to 127.0.0.1 only.
import { createServer, type IncomingMessage } from "node:http";

import { createRealtimeHub } from "./realtime/hub";
import { createScheduler } from "./workers/jobs";
import { configureStorageCors, validNudge } from "./workers/startup";
import { createHandlers, createWorker } from "./workers/worker";

const SWEEP_MS = 5 * 60 * 1000;
const port = Number(process.env.SERVICE_PORT ?? 4100);
const host = process.env.SERVICE_HOST ?? "127.0.0.1";
const appOrigin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;

const log = (message: string) => console.log(`[service] ${new Date().toISOString()} ${message}`);

const hub = createRealtimeHub({ redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:56379", allowedOrigin: appOrigin, log, keyPrefix: process.env.REALTIME_KEY_PREFIX });
const worker = createWorker(createHandlers(hub.publish), log);
const scheduler = createScheduler(log);

async function readBody(request: IncomingMessage, max = 1024): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > max) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/healthz") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, ...hub.stats() }));
      return;
    }
    if (request.method === "POST" && path === "/internal/nudge") {
      const body = await readBody(request);
      if (body === null || !validNudge(request.headers["x-timestamp"] as string | undefined, request.headers["x-signature"] as string | undefined, body)) {
        response.writeHead(401).end();
        return;
      }
      response.writeHead(202).end();
      void worker.tick();
      return;
    }
    response.writeHead(404).end();
  })().catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

server.on("upgrade", (request, socket, head) => {
  if (new URL(request.url ?? "/", "http://localhost").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  hub.handleUpgrade(request, socket, head);
});

async function sweep(): Promise<void> {
  await worker.tick();
  await scheduler.runDue();
}

server.listen(port, host, () => {
  log(`listening on http://${host}:${port} (realtime /ws, origin ${appOrigin})`);
  // Browsers upload straight to storage with signed URLs, so the bucket must allow the app origin.
  // STORAGE_CORS_EXTRA_ORIGINS (comma-separated) keeps other local origins working on the shared local
  // bucket, e.g. the E2E service adds the E2E origin while keeping the development one.
  const corsOrigins = [appOrigin, ...(process.env.STORAGE_CORS_EXTRA_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)];
  configureStorageCors(corsOrigins).then(
    () => log("storage CORS configured"),
    (error: unknown) => log(`storage CORS not configured (${error instanceof Error ? error.name : typeof error})`),
  );
  void sweep();
});
const timer = setInterval(() => void sweep(), SWEEP_MS);

function shutdown(): void {
  log("shutting down");
  clearInterval(timer);
  server.close();
  void hub.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
