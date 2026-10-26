import ICAL from "ical.js";
import { describe, expect, it } from "vitest";

import { escapeText, expand, foldLine, MAX_OCCURRENCES, parseRule, toIcs } from "@/modules/calendar/rules";

describe("recurrence rules (FR-CAL-2)", () => {
  it("accepts the safe subset and normalises it", () => {
    expect(parseRule("rrule:freq=weekly;interval=2;byday=MO,WE")).toEqual({ ok: true, rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" });
    expect(parseRule("FREQ=MONTHLY;UNTIL=20270101T000000Z").ok).toBe(true);
  });

  it("refuses sub-daily frequencies, anchors inside the rule, duplicates and unbounded counts", () => {
    for (const bad of ["FREQ=HOURLY", "FREQ=WEEKLY;DTSTART=20260101T000000Z", "FREQ=DAILY;FREQ=WEEKLY", "FREQ=DAILY;COUNT=5000", "FREQ=DAILY;COUNT=2;UNTIL=20270101T000000Z", "BYDAY=MO", "FREQ=DAILY;X-EVIL=1", ""]) {
      expect(parseRule(bad).ok, bad).toBe(false);
    }
  });

  it("expands weekly occurrences inside the window only", () => {
    const start = new Date("2026-11-02T04:30:00Z");
    const all = expand("FREQ=WEEKLY", start, start, new Date("2026-12-01T00:00:00Z"));
    expect(all.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(expand("FREQ=WEEKLY;COUNT=2", start, start, new Date("2027-12-01T00:00:00Z"))).toHaveLength(2);
    expect(expand(null, start, start, new Date(start.getTime() + 1))).toEqual([start]);
  });

  it("caps an endless daily rule", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(expand("FREQ=DAILY", start, start, new Date("2040-01-01T00:00:00Z")).length).toBe(MAX_OCCURRENCES);
  });
});

describe("iCalendar export (FR-CAL-3, RFC 5545)", () => {
  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const folded = foldLine(`SUMMARY:${"न".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(`SUMMARY:${"न".repeat(60)}`);
  });

  it("produces a document that a standard parser reads back, with the recurrence rule", () => {
    const ics = toIcs(
      [
        { uid: "entry-1@thapar-sns", title: "Lab; group A, week 1", description: "Bring a laptop\nand notes", location: "E-block", start: new Date("2026-11-02T04:30:00Z"), end: new Date("2026-11-02T06:30:00Z"), rrule: "FREQ=WEEKLY;COUNT=3" },
        { uid: "event-2@thapar-sns", title: "Hackathon", start: new Date("2026-11-20T00:00:00Z"), end: new Date("2026-11-21T00:00:00Z"), allDay: true, status: "CANCELLED" },
      ],
      "Thapar SNS",
      new Date("2026-10-25T00:00:00Z"),
    );
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const component = new ICAL.Component(ICAL.parse(ics));
    const events = component.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    expect(events.map((e) => e.summary)).toEqual(["Lab; group A, week 1", "Hackathon"]);
    expect(events[0]!.description).toBe("Bring a laptop\nand notes");
    expect(events[0]!.isRecurring()).toBe(true);
    const it = events[0]!.iterator();
    const starts = [it.next(), it.next(), it.next(), it.next()].filter(Boolean).map((t) => t!.toJSDate().toISOString());
    expect(starts).toEqual(["2026-11-02T04:30:00.000Z", "2026-11-09T04:30:00.000Z", "2026-11-16T04:30:00.000Z"]);
    expect(events[1]!.startDate.isDate).toBe(true);
  });
});
