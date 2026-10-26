import Link from "next/link";

import type { EventCard as EventCardData } from "@/modules/events";
import { formatDateTime } from "@/shared/format";

import { SocietyAvatar } from "../../_components/society-avatar";

const STATUS_LABELS = { DRAFT: "Draft", PUBLISHED: "Upcoming", LIVE: "Happening now", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;

export function EventCard({ event }: { event: EventCardData }) {
  const full = event.registeredCount >= event.capacity;
  return (
    <Link href={`/events/${event.id}`} className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
      <span className="flex items-center gap-3">
        <SocietyAvatar name={event.society?.name ?? "Campus"} logoAssetId={event.society?.logoAssetId} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{event.title}</span>
          <span className="block truncate text-sm text-muted">{event.society?.name ?? "Campus event"}</span>
        </span>
      </span>
      <span className="text-sm text-ink">
        {formatDateTime(event.startAt)} · {event.venue}
      </span>
      <span className="line-clamp-2 text-sm text-muted">{event.excerpt}</span>
      <span className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className={event.status === "CANCELLED" ? "rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground" : "rounded-full bg-canvas px-2 py-0.5 font-medium text-ink"}>{STATUS_LABELS[event.status]}</span>
        <span>
          {event.registeredCount}/{event.capacity} registered{full && event.status !== "CANCELLED" ? " (waitlist open)" : ""}
        </span>
        <span aria-hidden>·</span>
        <span>{event.interestCount} interested</span>
        {event.myStatus ? <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-brand-foreground">{event.myStatus === "REGISTERED" ? "Registered" : "Waitlisted"}</span> : null}
      </span>
    </Link>
  );
}

export { STATUS_LABELS };
