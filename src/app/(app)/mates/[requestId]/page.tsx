import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequest } from "@/modules/findmates";
import { formatDate, formatRelative } from "@/shared/format";

import { requireSession } from "../../_lib/session";
import { ChatLink, CloseRequestButton, DecideButtons, RespondForm } from "../_components/mate-actions";

export const metadata: Metadata = { title: "Teammate request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = { HACKATHON: "Hackathon", PROJECT: "Project", CASUAL: "Casual" } as const;

// UC-10 / ACT-1..9: one request; responders write a message, the creator accepts or declines.
export default async function MateRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await requireSession();
  const { requestId } = await params;
  if (!UUID.test(requestId)) notFound();
  const request = await getRequest(session.user.id, requestId);
  if (!request) notFound();
  const live = request.status === "OPEN";
  const full = request.currentCount >= request.teamSize;
  const now = new Date();
  return (
    <>
      <Link href="/mates" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Find Mates
      </Link>
      <article className="space-y-6">
        <header className="rounded-xl border border-line bg-surface p-5">
          <p className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">{TYPES[request.type]}</span>
            {request.subject ? <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">{request.subject}</span> : null}
            <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink">{request.status === "OPEN" ? "Open" : request.status === "CLOSED" ? "Closed" : "Expired"}</span>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">{request.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {request.mine ? "Your request" : `Posted by ${request.creator?.name ?? "a former user"}`} · {formatRelative(request.createdAt, now)} · open until {formatDate(request.expiresAt)} · team {request.currentCount}/{request.teamSize} · {Math.round(request.match * 100)}% match with your skills
          </p>
          {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- sanitised HTML only (sanitize-html.ts) */}
          <div className="rich-text mt-4 text-sm text-ink" dangerouslySetInnerHTML={{ __html: request.description }} />
          <p className="mt-4 flex flex-wrap gap-1">
            {request.skills.map((s) => (
              <span key={s.slug} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink">
                {s.label}
              </span>
            ))}
          </p>
          {request.mine && live ? (
            <div className="mt-4">
              <CloseRequestButton requestId={request.id} />
            </div>
          ) : null}
        </header>

        {!request.mine ? (
          <section aria-labelledby="respond-title" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="respond-title" className="mb-3 text-lg font-semibold text-ink">
              Your response
            </h2>
            {request.myResponse === "ACCEPTED" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-ink">You are on the team.</p>
                {request.myConnectionId ? <ChatLink connectionId={request.myConnectionId} /> : null}
              </div>
            ) : request.myResponse === "PENDING" ? (
              <p className="text-sm text-ink">You responded. You will be notified when the creator decides.</p>
            ) : request.myResponse === "REJECTED" ? (
              <p className="text-sm text-ink">The creator declined your response.</p>
            ) : live ? (
              <RespondForm requestId={request.id} />
            ) : (
              <p className="text-sm text-muted">This request is no longer open.</p>
            )}
          </section>
        ) : null}

        {request.responses ? (
          <section aria-labelledby="responses-title" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="responses-title" className="mb-3 text-lg font-semibold text-ink">
              Responses ({request.responses.length})
            </h2>
            {request.responses.length === 0 ? (
              <p className="text-sm text-muted">No responses yet.</p>
            ) : (
              <ul className="space-y-3">
                {request.responses.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-4">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{r.responder.name}</span>
                      <span className="text-muted">{[r.responder.branchName, r.responder.year ? `Year ${r.responder.year}` : null].filter(Boolean).join(", ")}</span>
                      <span className="ml-auto text-xs text-muted">{Math.round(r.match * 100)}% skill match</span>
                    </p>
                    <p className="mt-2 text-sm whitespace-pre-line text-ink">{r.message}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {r.status === "PENDING" ? (
                        <DecideButtons requestId={request.id} responseId={r.id} canAccept={live && !full} />
                      ) : r.status === "ACCEPTED" ? (
                        <>
                          <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">Accepted</span>
                          {r.connectionId ? <ChatLink connectionId={r.connectionId} /> : null}
                        </>
                      ) : (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink">Declined</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </article>
    </>
  );
}
