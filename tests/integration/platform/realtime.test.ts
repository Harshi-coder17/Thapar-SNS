// Realtime delivery end to end (ADR-0012, SPEC-RT): a real HTTP server with the hub's upgrade handler
// and real WebSocket clients. Redis is deliberately unreachable here, so the hub's in-process fallback
// is what delivers (fan-out across instances through Redis is checked manually against Valkey).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

vi.stubEnv("BETTER_AUTH_SECRET", "integration-test-secret-integration-test-0123");

const { createRealtimeHub } = await import("@/service/realtime/hub");
const { signTicket } = await import("@/shared/security/realtime-ticket");

const ORIGIN = "http://app.test";
let server: Server;
let hub: ReturnType<typeof createRealtimeHub>;
let url: string;

beforeAll(async () => {
  hub = createRealtimeHub({ redisUrl: "redis://127.0.0.1:1", allowedOrigin: ORIGIN, log: () => undefined });
  server = createServer();
  server.on("upgrade", (request, socket, head) => hub.handleUpgrade(request, socket, head));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
  await hub.close();
  await new Promise((resolve) => server.close(resolve));
});

/** Opens a socket; resolves with the socket once ready, or with the HTTP status it was refused with. */
function connect(ticket: string, origin = ORIGIN): Promise<{ socket?: WebSocket; status?: number; messages: { channel: string; body: string }[] }> {
  return new Promise((resolve) => {
    const messages: { channel: string; body: string }[] = [];
    const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`, { headers: { origin } });
    socket.on("message", (data) => {
      const message = JSON.parse(String(data)) as { channel: string; body: string };
      if (message.channel === "system") resolve({ socket, messages });
      else messages.push(message);
    });
    socket.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode, messages }));
    socket.on("error", () => undefined);
  });
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("realtime hub (ADR-0012)", () => {
  it("delivers only the channels named in the ticket", async () => {
    const a = await connect(signTicket("user-a", ["user:user-a", "event:e1"]));
    expect(a.socket).toBeDefined();
    await hub.publish("event:e1", JSON.stringify({ kind: "interest", interestCount: 3, version: 2 }));
    await hub.publish("user:user-b", JSON.stringify({ kind: "notification" }));
    await hub.publish("connection:c1", JSON.stringify({ kind: "message" }));
    await wait(100);
    expect(a.messages.map((m) => m.channel)).toEqual(["event:e1"]);
    a.socket!.close();
  });

  it("refuses a reused ticket, a forged or expired ticket, and a foreign origin", async () => {
    const ticket = signTicket("user-c", ["user:user-c"]);
    const first = await connect(ticket);
    expect(first.socket).toBeDefined();
    expect((await connect(ticket)).status).toBe(401);
    expect((await connect(`${ticket.slice(0, -3)}AAA`)).status).toBe(401);
    expect((await connect(signTicket("user-c", ["user:user-c"], Date.now() - 60_000))).status).toBe(401);
    expect((await connect(signTicket("user-c", ["user:user-c"]), "http://evil.test")).status).toBe(403);
    first.socket!.close();
  });

  it("ignores anything the browser sends", async () => {
    const c = await connect(signTicket("user-d", ["user:user-d"]));
    c.socket!.send(JSON.stringify({ subscribe: "connection:someone-else" }));
    await hub.publish("connection:someone-else", JSON.stringify({ kind: "message" }));
    await wait(100);
    expect(c.messages).toEqual([]);
    c.socket!.close();
  });
});
