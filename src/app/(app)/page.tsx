import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { listEvents } from "@/modules/events";
import { browseRequests } from "@/modules/findmates";
import { actorOf, listFeed, listFeedStories } from "@/modules/societies";
import { primaryNav } from "@/shared/layout/nav";
import { PageHeader } from "@/shared/layout/page-header";

import { requireSession } from "./_lib/session";
import { EventCard } from "./events/_components/event-card";
import { PostCard, StoriesStrip } from "./societies/_components/post-card";

// Home: stories, the user's upcoming events, upcoming events to discover, teammate requests that
// match the user's skills, posts from the societies the user follows or belongs to (owner decision
// 2026-10-24), then navigation cards. Montage-only content (trending, global search) is not built
// (gap list G-02..G-04).
export default async function HomePage() {
  const session = await requireSession();
  const actor = actorOf(session);
  const [stories, feed, mine, upcoming, mates] = await Promise.all([
    listFeedStories(actor),
    listFeed(actor),
    listEvents(session.user.id, { view: "mine" }),
    listEvents(session.user.id, { view: "upcoming" }),
    browseRequests(session.user.id, { view: "open", sort: "best" }),
  ]);
  const myUpcoming = mine.filter((e) => e.status === "PUBLISHED" || e.status === "LIVE").slice(0, 3);
  const discover = upcoming.filter((e) => !e.myStatus).slice(0, 3);
  const matches = mates.filter((r) => !r.mine && !r.myResponse && r.match > 0).slice(0, 3);
  const modules = primaryNav.filter((item) => item.href !== "/");
  const now = new Date();

  return (
    <>
      <PageHeader title="Welcome to Thapar SNS" description="A unified campus networking and services platform for TIET students." />

      <StoriesStrip stories={stories} showSociety now={now} title="Stories from your societies" />

      {myUpcoming.length ? (
        <section aria-labelledby="my-events-heading" className="mb-8">
          <h2 id="my-events-heading" className="mb-3 text-lg font-semibold text-ink">
            Your upcoming events
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {myUpcoming.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {discover.length ? (
        <section aria-labelledby="discover-heading" className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="discover-heading" className="text-lg font-semibold text-ink">
              Upcoming events
            </h2>
            <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline">
              All events
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {discover.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {matches.length ? (
        <section aria-labelledby="mates-heading" className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="mates-heading" className="text-lg font-semibold text-ink">
              Teams looking for your skills
            </h2>
            <Link href="/mates?sort=best" className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline-offset-4 hover:underline">
              Find Mates
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((r) => (
              <li key={r.id}>
                <Link href={`/mates/${r.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                  <span className="font-semibold text-ink">{r.title}</span>
                  <span className="line-clamp-2 text-sm text-muted">{r.excerpt}</span>
                  <span className="mt-auto text-xs text-muted">
                    {Math.round(r.match * 100)}% skill match · team {r.currentCount}/{r.teamSize}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="feed-heading" className="mb-8">
        <h2 id="feed-heading" className="mb-3 text-lg font-semibold text-ink">
          Latest from your societies
        </h2>
        {feed.posts.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
            Posts from societies you follow or belong to appear here.{" "}
            <Link href="/societies" className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline">
              Browse societies
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {feed.posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} showSociety now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-3 text-lg font-semibold text-ink">Explore</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex items-center gap-1 font-semibold text-ink">
                  {item.label}
                  <ArrowRight className="size-4 text-muted motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="text-sm text-muted">{item.summary}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
