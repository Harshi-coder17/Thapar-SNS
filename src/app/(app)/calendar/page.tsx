import { CalendarArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { calendar, type Layer, LAYER_LABELS, LAYERS } from "@/modules/calendar";
import { pageActor } from "@/modules/events";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";

import { chipClass, first, withQuery } from "../_components/chips";
import { requireSession } from "../_lib/session";
import { DeleteEntryButton, NewEntryPanel } from "./_components/entry-form";

export const metadata: Metadata = { title: "Calendar" };

const IST = 5.5 * 3600_000;
const LAYER_STYLE: Record<Layer, string> = { ACADEMIC: "bg-brand text-brand-foreground", CAMPUS: "bg-ink text-surface", SOCIETY: "bg-accent text-accent-foreground", PERSONAL: "bg-canvas text-ink border border-line" };
const dayKey = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const longFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

// FR-CAL-1..3: academic, campus, society-event and personal layers; month view; .ics export.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const monthParam = first(params.month);
  const nowIst = new Date(new Date().getTime() + IST);
  const [y, m] = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam.split("-").map(Number) : [nowIst.getUTCFullYear(), nowIst.getUTCMonth() + 1];
  const monthStart = new Date(Date.UTC(y!, m! - 1, 1) - IST);
  const monthEnd = new Date(Date.UTC(y!, m!, 1) - IST);
  const hidden = new Set((first(params.hide) ?? "").split(",").filter((l): l is Layer => (LAYERS as string[]).includes(l)));
  const layers = LAYERS.filter((l) => !hidden.has(l));
  const mine = first(params.mine) === "1";
  const isAdmin = session.user.role === "ADMIN";
  const items = await calendar.range(pageActor(session, isAdmin ? "platform" : "personal"), monthStart, monthEnd, layers, mine);
  const personal = isAdmin ? await calendar.range(pageActor(session), monthStart, monthEnd, layers.includes("PERSONAL") ? ["PERSONAL"] : [], mine) : [];
  const all = [...items.filter((i) => !isAdmin || i.layer !== "PERSONAL"), ...personal].sort((a, b) => a.start.getTime() - b.start.getTime());
  const byDay = new Map<string, typeof all>();
  for (const item of all) {
    for (let d = new Date(Math.max(item.start.getTime(), monthStart.getTime())); d < item.end || dayKey(d) === dayKey(item.start); d = new Date(d.getTime() + 86_400_000)) {
      if (d >= monthEnd) break;
      const key = dayKey(d);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
      if (d >= item.end) break;
    }
  }
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
  const prev = `${m === 1 ? y! - 1 : y}-${String(m === 1 ? 12 : m! - 1).padStart(2, "0")}`;
  const next = `${m === 12 ? y! + 1 : y}-${String(m === 12 ? 1 : m! + 1).padStart(2, "0")}`;
  const firstWeekday = (new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  const today = dayKey(new Date());
  const toggle = (layer: Layer) => {
    const next = new Set(hidden);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    return withQuery("/calendar", { month: monthParam, hide: [...next].join(","), mine: mine ? 1 : undefined });
  };
  const defaultStart = `${today}T10:00`;
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Academic dates, campus events, society events and your own entries in one place."
        action={
          <Button asChild variant="secondary">
            <a href="/api/calendar/export" download>
              <CalendarArrowDown aria-hidden />
              Export (.ics)
            </a>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="icon" aria-label="Previous month">
          <Link href={withQuery("/calendar", { month: prev, hide: first(params.hide), mine: mine ? 1 : undefined })}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold text-ink">{monthLabel}</h2>
        <Button asChild variant="secondary" size="icon" aria-label="Next month">
          <Link href={withQuery("/calendar", { month: next, hide: first(params.hide), mine: mine ? 1 : undefined })}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        <Link href="/calendar" className="ml-1 inline-flex min-h-11 items-center px-2 text-sm text-muted underline-offset-4 hover:underline">
          Today
        </Link>
      </div>
      <nav aria-label="Calendar layers" className="mb-4 flex flex-wrap gap-2">
        {LAYERS.map((layer) => (
          <Link key={layer} href={toggle(layer)} aria-current={!hidden.has(layer) ? "true" : undefined} className={chipClass(!hidden.has(layer))}>
            {LAYER_LABELS[layer]}
          </Link>
        ))}
        <Link href={withQuery("/calendar", { month: monthParam, hide: first(params.hide), mine: mine ? undefined : 1 })} aria-current={mine ? "true" : undefined} className={chipClass(mine)}>
          Only my society events
        </Link>
      </nav>
      <div className="mb-6">
        <NewEntryPanel layers={isAdmin ? ["PERSONAL", "ACADEMIC", "CAMPUS"] : ["PERSONAL"]} defaultStart={defaultStart} />
      </div>
      <div className="mb-8 hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => (
            // Leading blank cells have no date; their position is their identity.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <div key={cell ?? `blank-${i}`} className={cn("min-h-28 border-r border-b border-line p-1.5 text-xs", !cell && "bg-canvas")}>
              {cell ? (
                <>
                  <span className={cn("inline-flex size-6 items-center justify-center rounded-full", cell === today ? "bg-brand font-semibold text-brand-foreground" : "text-muted")}>{Number(cell.slice(8))}</span>
                  <ul className="mt-1 space-y-0.5">
                    {(byDay.get(cell) ?? []).slice(0, 4).map((item) => (
                      <li key={item.key} className={cn("truncate rounded px-1 py-0.5", LAYER_STYLE[item.layer], item.cancelled && "line-through opacity-70")}>
                        {/* The agenda below links to each event with full-size targets. */}
                        {item.title}
                      </li>
                    ))}
                    {(byDay.get(cell)?.length ?? 0) > 4 ? <li className="text-muted">+{byDay.get(cell)!.length - 4} more</li> : null}
                  </ul>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <section aria-labelledby="agenda-title">
        <h2 id="agenda-title" className="mb-3 text-lg font-semibold text-ink">
          Agenda for {monthLabel}
        </h2>
        {all.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Nothing scheduled this month.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {all.map((item) => (
              <li key={item.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className={cn("mt-0.5 rounded px-2 py-0.5 text-xs font-medium", LAYER_STYLE[item.layer])}>{LAYER_LABELS[item.layer]}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-medium text-ink", item.cancelled && "line-through")}>{item.eventId ? <Link href={`/events/${item.eventId}`} className="inline-flex min-h-11 items-center underline underline-offset-4">{item.title}</Link> : item.title}</span>
                  <span className="block text-sm text-muted">
                    {longFmt.format(item.start)}
                    {item.allDay ? ", all day" : `, ${timeFmt.format(item.start)} to ${timeFmt.format(item.end)}`}
                    {item.location ? ` · ${item.location}` : ""}
                    {item.recurring ? " · repeats" : ""}
                    {item.cancelled ? " · cancelled" : ""}
                  </span>
                  {item.description ? <span className="block text-sm text-ink">{item.description}</span> : null}
                </span>
                {item.editable && item.entryId ? <DeleteEntryButton entryId={item.entryId} admin={item.layer !== "PERSONAL"} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
