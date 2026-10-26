// OI-61: realtime fan-out between service instances through Redis (Valkey), the same image as
// docker-compose. A message published by one hub reaches a browser connected to another hub.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

vi.stubEnv("BETTER_AUTH_SECRET", "integration-test-secret-integration-test-0123");

const { createRealtimeHub } = await import("@/service/realtime/hub");
const { signTicket } = await import("@/shared/security/realtime-ticket");

const VALKEY = "valkey/valkey:8.1.4-alpine@sha256:e706d1213aaba6896c162bb6a3a9e1894e1a435f28f8f856d14fab2e10aa098b";
const ORIGIN = "http://app.test";
let valkey: StartedTestContainer;
const hubs: ReturnType<typeof createRealtimeHub>[] = [];
const servers: Server[] = [];

async function startHub(redisUrl: string): Promise<{ hub: ReturnType<typeof createRealtimeHub>; url: string }> {
  const hub = createRealtimeHub({ redisUrl, allowedOrigin: ORIGIN, log: () => undefined });
  const server = createServer();
  server.on("upgrade", (request, socket, head) => hub.handleUpgrade(request, socket, head));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  hubs.push(hub);
  servers.push(server);
  return { hub, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws` };
}

const connect = (url: string, ticket: string) =>
  new Promise<{ socket?: WebSocket; status?: number; messages: string[] }>((resolve) => {
    const messages: string[] = [];
    const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`, { headers: { origin: ORIGIN } });
    socket.on("message", (data) => {
      const m = JSON.parse(String(data)) as { channel: string; body: string };
      if (m.channel === "system") resolve({ socket, messages });
      else messages.push(`${m.channel}|${m.body}`);
    });
    socket.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode, messages }));
    socket.on("error", () => undefined);
  });

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};

beforeAll(async () => {
  valkey = await new GenericContainer(VALKEY).withCommand(["valkey-server", "--save", "", "--appendonly", "no"]).withExposedPorts(6379).withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/)).start();
});
afterAll(async () => {
  for (const hub of hubs) await hub.close();
  for (const server of servers) await new Promise((r) => server.close(r));
  await valkey?.stop();
});

describe("realtime across service instances (OI-61)", () => {
  it("delivers a message published on one instance to a client of another, and consumes ticket nonces across instances", async () => {
    const redisUrl = `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`;
    const a = await startHub(redisUrl);
    const b = await startHub(redisUrl);
    await until(() => a.hub.stats().redis && b.hub.stats().redis);
    expect(a.hub.stats().redis && b.hub.stats().redis).toBe(true);
    const ticket = signTicket("user-x", ["user:user-x"]);
    const client = await connect(b.url, ticket);
    expect(client.socket).toBeDefined();
    await new Promise((r) => setTimeout(r, 200)); // subscriber ready
    await a.hub.publish("user:user-x", JSON.stringify({ kind: "notification" }));
    await until(() => client.messages.length > 0);
    expect(client.messages).toEqual([`user:user-x|${JSON.stringify({ kind: "notification" })}`]);
    // The same ticket cannot be replayed against the other instance (shared nonce store).
    expect((await connect(a.url, ticket)).status).toBe(401);
    client.socket!.close();
  });
});
