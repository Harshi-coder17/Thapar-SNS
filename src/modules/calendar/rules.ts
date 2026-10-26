// Recurrence and iCalendar helpers (FR-CAL-2, FR-CAL-3, OI-25). Pure functions, unit-tested.
import * as rrulePackage from "rrule";

// rrule ships a CommonJS main without named-export hints: Node's ESM loader exposes it as `default`,
// bundlers expose the named export. Accept both.
const { RRule } = ("RRule" in rrulePackage && rrulePackage.RRule ? rrulePackage : (rrulePackage as unknown as { default: typeof rrulePackage }).default) as typeof rrulePackage;

export const WINDOW_DAYS = 90;
export const MAX_OCCURRENCES = 1000;

const ALLOWED_KEYS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH", "BYSETPOS", "WKST"]);
const FREQS = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

/**
 * Validates an RRULE value (without the "RRULE:" prefix). Only a safe subset is accepted: no DTSTART
 * or TZID inside the rule (the entry's start time is the anchor), no sub-daily frequencies.
 * Returns the normalised rule or an error message.
 */
export function parseRule(raw: string): { ok: true; rule: string } | { ok: false; message: string } {
  const value = raw.trim().replace(/^RRULE:/i, "").toUpperCase();
  if (!value || value.length > 300) return { ok: false, message: "Enter a valid repeat rule." };
  const parts = value.split(";");
  const seen = new Set<string>();
  for (const part of parts) {
    const match = /^([A-Z]+)=([A-Z0-9,+-]+)$/.exec(part);
    if (!match || !ALLOWED_KEYS.has(match[1]!) || seen.has(match[1]!)) return { ok: false, message: "Enter a valid repeat rule." };
    seen.add(match[1]!);
    if (match[1] === "FREQ" && !FREQS.has(match[2]!)) return { ok: false, message: "Repeat daily, weekly, monthly or yearly." };
    if (match[1] === "COUNT" && !(Number(match[2]) >= 1 && Number(match[2]) <= MAX_OCCURRENCES)) return { ok: false, message: `Repeat at most ${MAX_OCCURRENCES} times.` };
    if (match[1] === "INTERVAL" && !(Number(match[2]) >= 1 && Number(match[2]) <= 365)) return { ok: false, message: "Enter a valid repeat interval." };
  }
  if (!seen.has("FREQ")) return { ok: false, message: "Choose how often the entry repeats." };
  if (seen.has("COUNT") && seen.has("UNTIL")) return { ok: false, message: "Use either an end date or a number of repeats, not both." };
  try {
    RRule.parseString(value);
  } catch {
    return { ok: false, message: "Enter a valid repeat rule." };
  }
  return { ok: true, rule: value };
}

/** Occurrence start times of a rule anchored at `start`, within [from, to), capped at MAX_OCCURRENCES. */
export function expand(rule: string | null, start: Date, from: Date, to: Date): Date[] {
  if (!rule) return start >= from && start < to ? [start] : [];
  const rrule = new RRule({ ...RRule.parseString(rule), dtstart: start });
  const result: Date[] = [];
  rrule.all((date, i) => {
    if (date >= to || i >= MAX_OCCURRENCES) return false;
    if (date >= from) result.push(date);
    return true;
  });
  return result;
}

// RFC 5545 output ------------------------------------------------------------------------------

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const n = bytes.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  rrule?: string | null;
  url?: string | null;
  status?: "CONFIRMED" | "CANCELLED";
}

/** A complete VCALENDAR document with CRLF line endings. */
export function toIcs(events: IcsEvent[], name: string, now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Thapar SNS//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(now)}`);
    if (e.allDay) {
      const end = e.end > e.start ? e.end : new Date(e.start.getTime() + 86_400_000);
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`, `DTEND;VALUE=DATE:${dateOnly(end)}`);
    } else {
      lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.status) lines.push(`STATUS:${e.status}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
