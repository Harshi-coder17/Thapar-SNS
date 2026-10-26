// Outbox worker (ADR-0004, background-jobs.md §3 to §5). Claims due rows with SKIP LOCKED, runs the
// handler for each, then completes or schedules a retry (DEAD after 8 attempts). Handlers are
// idempotent; a business outcome (e.g. a rejected file) is a successful run, not a failure.
import { randomUUID } from "node:crypto";

import { processUploadedAsset } from "@/modules/assets";
import { claimDue, complete, fail } from "@/modules/outbox";
import { getDb } from "@/shared/db/client";

import { makeThumbnail } from "./thumbnail";

export type Handler = (payload: Record<string, unknown>) => Promise<void>;

const str = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) throw new TypeError(`payload.${name} missing`);
  return value;
};

export function createHandlers(publish: (channel: string, body: string) => Promise<void>): Record<string, Handler> {
  return {
    "file.uploaded": async (payload) => {
      await processUploadedAsset(str(payload.assetId, "assetId"), makeThumbnail);
    },
    "notification.created": async (payload) => {
      await publish(`user:${str(payload.recipientId, "recipientId")}`, JSON.stringify({ kind: "notification" }));
    },
    "realtime.publish": async (payload) => {
      await publish(str(payload.channel, "channel"), str(payload.body, "body"));
    },
  };
}

export function createWorker(handlers: Record<string, Handler>, log: (message: string) => void) {
  const workerId = `service-${randomUUID()}`;
  let running = false;
  let again = false;

  async function drain(): Promise<number> {
    let processed = 0;
    for (;;) {
      const batch = await claimDue(getDb(), workerId, 20);
      if (batch.length === 0) return processed;
      for (const event of batch) {
        const handler = handlers[event.eventType];
        try {
          if (!handler) throw new TypeError(`no handler for ${event.eventType}`);
          await handler((event.payload ?? {}) as Record<string, unknown>);
          await complete(getDb(), event.id, workerId);
        } catch (error) {
          const name = error instanceof Error ? error.name : typeof error;
          const outcome = await fail(getDb(), event.id, workerId, event.attemptCount, name);
          log(`outbox ${event.eventType} ${event.id} failed (${name}); ${outcome}`);
        }
        processed++;
      }
    }
  }

  return {
    workerId,
    /** Runs until no due rows remain; concurrent calls coalesce into one more pass. */
    async tick(): Promise<void> {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          await drain();
        } while (again);
      } catch (error) {
        log(`outbox drain failed (${error instanceof Error ? error.name : typeof error})`);
      } finally {
        running = false;
      }
    },
  };
}
