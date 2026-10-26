// Scheduled jobs (background-jobs.md §6). They only tidy state: every user-visible rule is enforced
// at query time. Each job is idempotent and independent; one failing never stops the others.
import { expireStaleUploads } from "@/modules/assets";
import { extendCalendarWindows } from "@/modules/calendar";
import { tidyEventStatuses } from "@/modules/events";
import { expireMateRequests } from "@/modules/findmates";
import { purgeStaleSessions } from "@/modules/identity";
import { deleteOldDone } from "@/modules/outbox";
import { deleteExpiredStories } from "@/modules/societies";
import { getDb } from "@/shared/db/client";

export interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<number>;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const JOBS: Job[] = [
  { name: "stories.cleanup", everyMs: HOUR, run: () => deleteExpiredStories() },
  { name: "mates.expire", everyMs: HOUR, run: () => expireMateRequests() },
  { name: "assets.expire", everyMs: HOUR, run: () => expireStaleUploads() },
  { name: "events.status", everyMs: HOUR, run: () => tidyEventStatuses() },
  { name: "calendar.window", everyMs: DAY, run: () => extendCalendarWindows() },
  { name: "outbox.retention", everyMs: DAY, run: () => deleteOldDone(getDb()) },
  { name: "sessions.cleanup", everyMs: DAY, run: () => purgeStaleSessions() },
];

/**
 * Jobs switched off for this process (OI-63, owner 2026-10-26: option (b)). Outside production the
 * expired-story deletion is off, so local development and test stories are never deleted
 * automatically; their 24-hour expiry still applies at query time, so expired stories stay invisible.
 * In production (NODE_ENV=production) every job runs. SERVICE_DISABLED_JOBS (comma-separated job
 * names, or "none") overrides the default explicitly.
 */
export function disabledJobs(env: Record<string, string | undefined> = process.env): Set<string> {
  const explicit = env.SERVICE_DISABLED_JOBS;
  if (explicit !== undefined) return new Set(explicit.split(",").map((name) => name.trim()).filter((name) => name && name !== "none"));
  return env.NODE_ENV === "production" ? new Set() : new Set(["stories.cleanup"]);
}

export function createScheduler(log: (message: string) => void, jobs: Job[] = JOBS, disabled: Set<string> = disabledJobs()) {
  const lastRun = new Map<string, number>();
  if (disabled.size) log(`scheduled jobs disabled in this environment: ${[...disabled].join(", ")}`);
  return {
    /** Runs every job that is due (all of them on the first call). */
    async runDue(now = Date.now()): Promise<void> {
      for (const job of jobs) {
        if (disabled.has(job.name)) continue;
        if (now - (lastRun.get(job.name) ?? 0) < job.everyMs) continue;
        lastRun.set(job.name, now);
        try {
          const count = await job.run();
          if (count) log(`job ${job.name}: ${count}`);
        } catch (error) {
          log(`job ${job.name} failed (${error instanceof Error ? error.name : typeof error})`);
        }
      }
    },
  };
}
