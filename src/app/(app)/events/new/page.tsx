import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MAX_FIELDS } from "@/modules/events";
import { getSocietyActor } from "@/modules/societies";
import { PageHeader } from "@/shared/layout/page-header";

import { first } from "../../_components/chips";
import { requireSession } from "../../_lib/session";
import { EventForm } from "../_components/event-form";

export const metadata: Metadata = { title: "New event" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// FR-EVT-1: a society event (an active Head of that society, ?society=<id>) or a campus event
// (platform admins, ?as=admin). Checked here for display and again by the API.
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ society?: string; as?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const societyId = first(params.society);
  const asAdmin = first(params.as) === "admin" && !societyId;
  if (asAdmin && session.user.role !== "ADMIN") notFound();
  const society = societyId && UUID.test(societyId) ? await getSocietyActor(session.user.id, societyId) : null;
  if (!asAdmin && !society) notFound();
  const now = new Date().getTime();
  const toLocal = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16);
  return (
    <>
      <Link href={society ? `/societies/${society.slug}/workspace/events` : "/events"} className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back
      </Link>
      <PageHeader title={society ? `New event for ${society.name}` : "New campus event"} description={society ? "The event is published as the society." : "Campus events are published by the platform administration."} />
      <EventForm
        mode="create"
        societyId={society?.id ?? null}
        asAdmin={asAdmin}
        maxFields={MAX_FIELDS}
        initial={{ title: "", description: "", venue: "", startAt: toLocal(now + 7 * 86_400_000), endAt: toLocal(now + 7 * 86_400_000 + 2 * 3600_000), capacity: 100, fields: [] }}
      />
    </>
  );
}
