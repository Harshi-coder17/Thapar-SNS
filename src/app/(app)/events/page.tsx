import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listEvents } from "@/modules/events";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";

import { chipClass, first, withQuery } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { requireSession } from "../_lib/session";
import { EventCard } from "./_components/event-card";

export const metadata: Metadata = { title: "Events" };

type View = "upcoming" | "past" | "mine" | "interested";
const VIEWS: { key: View; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "mine", label: "My registrations" },
  { key: "interested", label: "Interested" },
  { key: "past", label: "Past" },
];

// UCD-6 Browse Events (FR-EVT-3/4): published events of active societies and campus events.
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const view = (VIEWS.find((v) => v.key === first(params.view))?.key ?? "upcoming") as View;
  const q = first(params.q)?.slice(0, 100) ?? "";
  const events = await listEvents(session.user.id, { view, q });
  const isAdmin = session.user.role === "ADMIN";
  return (
    <>
      <PageHeader
        title="Events"
        description="Find society and campus events, register and see who else is interested."
        action={
          isAdmin ? (
            <Button asChild variant="secondary">
              <Link href="/events/new?as=admin">
                <Plus aria-hidden />
                Campus event
              </Link>
            </Button>
          ) : undefined
        }
      />
      <form role="search" action="/events" className="mb-4 flex gap-2">
        {view !== "upcoming" ? <input type="hidden" name="view" value={view} /> : null}
        <label htmlFor="event-search" className="sr-only">
          Search events
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="event-search" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Search by title or venue" className="block min-h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <nav aria-label="Event lists" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {VIEWS.map((item) => (
          <Link key={item.key} href={withQuery("/events", { view: item.key === "upcoming" ? undefined : item.key, q })} aria-current={view === item.key ? "page" : undefined} className={chipClass(view === item.key)}>
            {item.label}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <EmptyState>{view === "mine" ? "You have not registered for any events yet." : view === "interested" ? "You have not marked any events as interesting yet." : "No events found."}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
