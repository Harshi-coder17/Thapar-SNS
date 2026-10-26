import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/assets", () => ({ expireStaleUploads: vi.fn() }));
vi.mock("@/modules/calendar", () => ({ extendCalendarWindows: vi.fn() }));
vi.mock("@/modules/events", () => ({ tidyEventStatuses: vi.fn() }));
vi.mock("@/modules/findmates", () => ({ expireMateRequests: vi.fn() }));
vi.mock("@/modules/identity", () => ({ purgeStaleSessions: vi.fn() }));
vi.mock("@/modules/outbox", () => ({ deleteOldDone: vi.fn() }));
vi.mock("@/modules/societies", () => ({ deleteExpiredStories: vi.fn() }));
vi.mock("@/shared/db/client", () => ({ getDb: vi.fn() }));

const { createScheduler, disabledJobs } = await import("@/service/workers/jobs");

describe("scheduled jobs per environment (OI-63)", () => {
  it("keeps expired-story deletion off outside production and on in production", () => {
    expect([...disabledJobs({ NODE_ENV: "development" })]).toEqual(["stories.cleanup"]);
    expect([...disabledJobs({})]).toEqual(["stories.cleanup"]);
    expect([...disabledJobs({ NODE_ENV: "production" })]).toEqual([]);
  });

  it("lets SERVICE_DISABLED_JOBS override the default explicitly", () => {
    expect([...disabledJobs({ NODE_ENV: "development", SERVICE_DISABLED_JOBS: "none" })]).toEqual([]);
    expect([...disabledJobs({ NODE_ENV: "production", SERVICE_DISABLED_JOBS: "stories.cleanup, sessions.cleanup" })]).toEqual(["stories.cleanup", "sessions.cleanup"]);
  });

  it("never runs a disabled job, and still runs the others", async () => {
    const stories = vi.fn(async () => 3);
    const uploads = vi.fn(async () => 0);
    const scheduler = createScheduler(() => undefined, [
      { name: "stories.cleanup", everyMs: 1, run: stories },
      { name: "assets.expire", everyMs: 1, run: uploads },
    ], new Set(["stories.cleanup"]));
    await scheduler.runDue(1_000);
    await scheduler.runDue(2_000);
    expect(stories).not.toHaveBeenCalled();
    expect(uploads).toHaveBeenCalledTimes(2);
  });
});
