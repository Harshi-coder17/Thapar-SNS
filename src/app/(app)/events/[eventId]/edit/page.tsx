import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MAX_FIELDS } from "@/modules/events";
import { isoToIstLocal } from "@/shared/format";
import { PageHeader } from "@/shared/layout/page-header";

import { EventForm } from "../../_components/event-form";
import { loadEvent } from "../load";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { event, asAdmin } = await loadEvent((await params).eventId);
  if (!event.canManage || event.status === "CANCELLED" || event.status === "COMPLETED") notFound();
  return (
    <>
      <Link href={`/events/${event.id}`} className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to the event
      </Link>
      <PageHeader title="Edit event" description="Registered people keep their places; capacity cannot drop below the number registered." />
      <EventForm
        mode="edit"
        societyId={event.society?.id ?? null}
        asAdmin={asAdmin}
        maxFields={MAX_FIELDS}
        initial={{ id: event.id, title: event.title, description: event.description, venue: event.venue, startAt: isoToIstLocal(event.startAt), endAt: isoToIstLocal(event.endAt), capacity: event.capacity, fields: event.registrationSchema }}
      />
    </>
  );
}
