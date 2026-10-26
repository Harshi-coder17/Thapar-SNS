import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listEvents } from "@/modules/events";
import { Button } from "@/shared/ui/button";

import { EmptyState } from "../../../../_components/empty-state";
import { EventCard } from "../../../../events/_components/event-card";
import { loadWorkspace } from "../../load";

export const metadata: Metadata = { title: "Society events" };

// Slice 2b in the workspace: the society's events including drafts (Heads only).
export default async function WorkspaceEventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { session, society } = await loadWorkspace((await params).slug);
  const [upcoming, past] = await Promise.all([
    listEvents(session.user.id, { societyId: society.id, includeDrafts: true, view: "upcoming" }),
    listEvents(session.user.id, { societyId: society.id, includeDrafts: true, view: "past" }),
  ]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Events</h2>
        {society.isActive ? (
          <Button asChild>
            <Link href={`/events/new?society=${society.id}`}>
              <Plus aria-hidden />
              New event
            </Link>
          </Button>
        ) : null}
      </div>
      <h3 className="mb-2 text-base font-semibold text-ink">Upcoming and drafts</h3>
      {upcoming.length === 0 ? (
        <EmptyState>No upcoming events or drafts.</EmptyState>
      ) : (
        <ul className="mb-6 grid gap-4 sm:grid-cols-2">
          {upcoming.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 mb-2 text-base font-semibold text-ink">Past and cancelled</h3>
      {past.length === 0 ? (
        <EmptyState>No past events.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {past.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
