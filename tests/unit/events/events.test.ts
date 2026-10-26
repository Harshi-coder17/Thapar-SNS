import { describe, expect, it } from "vitest";

import { createEventSchema, type RegistrationField, registrationSchemaSchema, validateResponses } from "@/modules/events/schemas";
import { effectiveStatus } from "@/modules/events/service";

const fields: RegistrationField[] = [
  { id: "team", label: "Team name", type: "short_text", required: true },
  { id: "size", label: "Team size", type: "number", required: false },
  { id: "track", label: "Track", type: "single_select", required: true, options: ["AI", "Web"] },
  { id: "tools", label: "Tools", type: "multi_select", required: false, options: ["Git", "Docker"] },
  { id: "rules", label: "I accept the rules", type: "checkbox", required: true },
];

describe("event registration answers (UC-07 steps 3 and 4, OI-12)", () => {
  it("accepts valid answers and drops unknown fields", () => {
    const result = validateResponses(fields, { team: " Alpha ", size: "3", track: "AI", tools: ["Git", "Git"], rules: true, injected: "<script>" });
    expect(result).toEqual({ ok: true, value: { team: "Alpha", size: 3, track: "AI", tools: ["Git"], rules: true } });
  });

  it("reports missing required answers, unknown options and unticked required boxes", () => {
    const result = validateResponses(fields, { track: "Blockchain", tools: ["Kubernetes"], rules: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fields).sort()).toEqual(["rules", "team", "tools", "track"]);
  });

  it("limits the form to 10 fields with unique ids and real options", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `f${i}`, label: "x", type: "short_text", required: false }));
    expect(registrationSchemaSchema.safeParse(many).success).toBe(false);
    expect(registrationSchemaSchema.safeParse([{ id: "a", label: "x", type: "short_text" }, { id: "a", label: "y", type: "short_text" }]).success).toBe(false);
    expect(registrationSchemaSchema.safeParse([{ id: "a", label: "x", type: "single_select", options: ["one"] }]).success).toBe(false);
  });

  it("validates capacity and title on creation", () => {
    const base = { title: "Hack", description: "<p>x</p>", venue: "Hall", startAt: "2026-12-01T10:00:00+05:30", endAt: "2026-12-01T12:00:00+05:30", capacity: 10, registrationSchema: [] };
    expect(createEventSchema.safeParse(base).success).toBe(true);
    expect(createEventSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("event status (OI-13)", () => {
  const event = { startAt: new Date("2026-12-01T10:00:00Z"), endAt: new Date("2026-12-01T12:00:00Z") };
  it("derives LIVE and COMPLETED from the time window of a published event", () => {
    expect(effectiveStatus({ ...event, status: "PUBLISHED" }, new Date("2026-11-30T00:00:00Z"))).toBe("PUBLISHED");
    expect(effectiveStatus({ ...event, status: "PUBLISHED" }, new Date("2026-12-01T11:00:00Z"))).toBe("LIVE");
    expect(effectiveStatus({ ...event, status: "PUBLISHED" }, new Date("2026-12-01T12:00:00Z"))).toBe("COMPLETED");
  });
  it("keeps drafts and cancellations as they are", () => {
    expect(effectiveStatus({ ...event, status: "DRAFT" }, new Date("2026-12-02T00:00:00Z"))).toBe("DRAFT");
    expect(effectiveStatus({ ...event, status: "CANCELLED" }, new Date("2026-12-01T11:00:00Z"))).toBe("CANCELLED");
  });
});
