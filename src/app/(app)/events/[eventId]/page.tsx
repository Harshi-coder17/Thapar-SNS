import { CalendarDays, MapPin, Pencil, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listRegistrations, pageActor } from "@/modules/events";
import { formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { SocietyAvatar } from "../../_components/society-avatar";
import { STATUS_LABELS } from "../_components/event-card";
import { InterestButton } from "../_components/interest-button";
import { CancelRegistrationButton, ManageActions } from "../_components/manage-actions";
import { RegisterForm } from "../_components/register-form";
import { loadEvent } from "./load";

type Params = Promise<{ eventId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { event } = await loadEvent((await params).eventId);
  return { title: event.title };
}

// UC-07 and FR-EVT-1..5: event details, registration, interest, and management for its managers.
export default async function EventPage({ params }: { params: Params }) {
  const { session, event, asAdmin } = await loadEvent((await params).eventId);
  const open = event.status === "PUBLISHED" || event.status === "LIVE";
  const full = event.registeredCount >= event.capacity;
  const registrations = event.canManage ? await listRegistrations(pageActor(session, asAdmin ? "platform" : "personal"), event.id) : null;
  const q = asAdmin ? "?as=admin" : "";
  return (
    <>
      <Link href="/events" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Events
      </Link>
      <article className="space-y-6">
        <header className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-start gap-3">
            <SocietyAvatar name={event.society?.name ?? "Campus"} logoAssetId={event.society?.logoAssetId} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">{event.title}</h1>
              <p className="text-sm text-muted">
                {event.society ? (
                  <Link href={`/societies/${event.society.slug}`} className="underline underline-offset-4">
                    {event.society.name}
                  </Link>
                ) : (
                  "Campus event"
                )}{" "}
                · <span className="font-medium text-ink">{STATUS_LABELS[event.status]}</span>
              </p>
            </div>
          </div>
          <dl className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">When</dt>
              <dd>
                {formatDateTime(event.startAt)} to {formatDateTime(event.endAt)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Where</dt>
              <dd>{event.venue}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted" aria-hidden />
              <dt className="sr-only">Places</dt>
              <dd>
                {event.registeredCount} of {event.capacity} places taken
              </dd>
            </div>
          </dl>
          {event.status === "CANCELLED" ? (
            <p role="note" className="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
              This event was cancelled{event.cancelReason ? `: ${event.cancelReason}` : "."} Registration is closed.
            </p>
          ) : null}
          {event.status !== "DRAFT" ? (
            <div className="mt-4">
              <InterestButton eventId={event.id} interested={event.interested} count={event.interestCount} version={event.interestVersion} open={open} />
            </div>
          ) : null}
        </header>

        <section aria-labelledby="about-title" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="about-title" className="mb-2 text-lg font-semibold text-ink">
            About this event
          </h2>
          {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- sanitised HTML only (sanitize-html.ts) */}
          <div className="rich-text text-sm text-ink" dangerouslySetInnerHTML={{ __html: event.description }} />
        </section>

        {event.status !== "DRAFT" ? (
          <section aria-labelledby="registration-title" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="registration-title" className="mb-3 text-lg font-semibold text-ink">
              Registration
            </h2>
            {event.myStatus === "REGISTERED" ? (
              <div className="space-y-3">
                <p className="text-sm text-ink">You are registered. A confirmation is in your notifications.</p>
                {event.status === "PUBLISHED" ? <CancelRegistrationButton eventId={event.id} /> : null}
              </div>
            ) : event.myStatus === "WAITLISTED" ? (
              <div className="space-y-3">
                <p className="text-sm text-ink">You are on the waitlist (position {event.waitlistPosition}). You will be notified if a place opens.</p>
                {event.status === "PUBLISHED" ? <CancelRegistrationButton eventId={event.id} /> : null}
              </div>
            ) : open ? (
              <>
                {full ? <p className="mb-3 text-sm text-muted">The event is full. You can join the waitlist.</p> : null}
                <RegisterForm eventId={event.id} fields={event.registrationSchema} full={full} />
              </>
            ) : (
              <p className="text-sm text-muted">Registration is closed.</p>
            )}
          </section>
        ) : null}

        {event.canManage ? (
          <section aria-labelledby="manage-title" className="space-y-4 rounded-xl border border-brand/30 bg-surface p-5">
            <h2 id="manage-title" className="text-lg font-semibold text-ink">
              Manage {asAdmin ? "(platform administrator)" : event.society ? `(acting for ${event.society.name})` : ""}
            </h2>
            <div className="flex flex-wrap gap-2">
              {event.status !== "CANCELLED" && event.status !== "COMPLETED" ? (
                <Button asChild variant="secondary">
                  <Link href={`/events/${event.id}/edit${q}`}>
                    <Pencil aria-hidden />
                    Edit
                  </Link>
                </Button>
              ) : null}
            </div>
            <ManageActions eventId={event.id} draft={event.status === "DRAFT"} cancellable={event.status === "DRAFT" || open} asAdmin={asAdmin} />
            {registrations ? (
              <div className="overflow-x-auto">
                <h3 className="mb-2 text-base font-semibold text-ink">Registrations ({registrations.filter((r) => r.status === "REGISTERED").length} registered, {registrations.filter((r) => r.status === "WAITLISTED").length} waitlisted)</h3>
                {registrations.length === 0 ? (
                  <p className="text-sm text-muted">No registrations yet.</p>
                ) : (
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Branch and year</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        {event.registrationSchema.map((f) => (
                          <th key={f.id} className="py-2 pr-3 font-medium">
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.map((r) => (
                        <tr key={r.userId} className="border-t border-line">
                          <td className="py-2 pr-3 text-ink">{r.name}</td>
                          <td className="py-2 pr-3 text-muted">{[r.branchName, r.year ? `Year ${r.year}` : null].filter(Boolean).join(", ")}</td>
                          <td className="py-2 pr-3 text-ink">{r.status === "REGISTERED" ? "Registered" : r.status === "WAITLISTED" ? "Waitlisted" : "Cancelled"}</td>
                          {event.registrationSchema.map((f) => {
                            const value = r.responses[f.id];
                            return (
                              <td key={f.id} className="py-2 pr-3 text-ink">
                                {Array.isArray(value) ? value.join(", ") : value === true ? "Yes" : value === false ? "No" : value === undefined ? "" : String(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </article>
    </>
  );
}
