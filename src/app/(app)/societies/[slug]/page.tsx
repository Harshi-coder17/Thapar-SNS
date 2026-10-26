import { ArrowLeftRight, AtSign, Globe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listSocietyHeads, listSocietyMembers, listSocietyPosts, listSocietyStories, POSITION_MAX, REQUEST_MESSAGE_MAX, type SocietyDetail } from "@/modules/societies";
import { formatDate, plural } from "@/shared/format";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";

import { AdminPanel } from "../_components/admin-panel";
import { FacultyList } from "../_components/faculty-list";
import { FollowButton } from "../_components/follow-button";
import { headRows } from "../_components/head-rows";
import { HeadsPanel } from "../_components/heads-panel";
import { MembersList } from "../_components/members-list";
import { MembershipActions } from "../_components/membership-actions";
import { PostCard, StoriesStrip } from "../_components/post-card";
import { SocietyAvatar } from "../../_components/society-avatar";
import { loadSociety } from "./load";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ tab?: string; type?: string; cursor?: string }>;
type Tab = "posts" | "about" | "members" | "admin";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { society } = await loadSociety((await params).slug);
  return { title: society.name };
}

const OFFICIAL_DIRECTORY = "https://studentsocieties.thapar.edu/";
const LINK_LABELS = { website: "Website", instagram: "Instagram", linkedin: "LinkedIn" } as const;

// UCD-3: the society's single public page, seen from the student's personal account. Management
// happens in the society workspace (Heads) or the Administration tab (platform admins), and every
// action is authorised again on the server (ADR-0013).
export default async function SocietyPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { session, actor, society } = await loadSociety((await params).slug);
  const query = await searchParams;
  // Platform-admin oversight is a separate capacity from society Head access (ADR-0013 §3.4).
  const isAdmin = society.adminCan["society.setActive"];
  const tabs: { key: Tab; label: string }[] = [
    { key: "posts", label: "Posts" },
    { key: "about", label: "About" },
    ...(society.can["members.viewAll"] || society.adminCan["members.viewAll"] ? [{ key: "members" as const, label: "Members" }] : []),
    ...(isAdmin ? [{ key: "admin" as const, label: "Administration" }] : []),
  ];
  const tab: Tab = tabs.some((item) => item.key === query.tab) ? (query.tab as Tab) : "posts";
  const base = `/societies/${society.slug}`;
  const now = new Date();

  return (
    <>
      <Link href="/societies" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Societies
      </Link>
      <section aria-labelledby="society-name" className="mb-6 overflow-hidden rounded-xl border border-line bg-surface">
        {society.bannerAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs
          <img src={`/api/assets/${society.bannerAssetId}/file`} alt="" className="h-24 w-full object-cover sm:h-32" />
        ) : (
          <div aria-hidden className="h-24 bg-gradient-to-r from-brand to-brand-hover sm:h-32" />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SocietyAvatar name={society.shortName ?? society.name} logoAssetId={society.logoAssetId} size="lg" className="-mt-14 border-4 border-surface sm:-mt-16" />
            <div className="min-w-0">
              <h1 id="society-name" className="text-2xl font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">
                {society.name}
              </h1>
              <p className="text-sm text-muted">
                {[society.category?.label, plural(society.memberCount, "member"), plural(society.followerCount, "follower")].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {society.can["workspace.open"] ? (
              <Button asChild>
                <Link href={`${base}/workspace`}>
                  <ArrowLeftRight aria-hidden />
                  Open society workspace
                </Link>
              </Button>
            ) : null}
            {society.isActive ? <FollowButton societyId={society.id} following={society.following} /> : null}
            <MembershipActions
              societyId={society.id}
              userId={session.user.id}
              societyName={society.name}
              memberRoleLabel={society.isHead ? "Head" : society.isMember ? "Member" : null}
              isHead={society.isHead}
              pendingRequest={society.pendingRequest !== null}
              canRequest={society.can["society.requestMembership"]}
              maxMessage={REQUEST_MESSAGE_MAX}
            />
          </div>
        </div>
        {!society.isActive ? (
          <p role="note" className="border-t border-line bg-canvas px-5 py-3 text-sm text-ink">
            {society.awaitingHead
              ? "Official listing from the Thapar student societies directory. This organisation is not active on Thapar SNS yet: it starts posting, accepting members and running events once a platform administrator appoints its first Head."
              : "This society is inactive. Its posts stay readable, but it is hidden from the directory and accepts no new posts, members or followers."}
          </p>
        ) : null}
        <nav aria-label="Society sections" className="flex gap-1 overflow-x-auto border-t border-line px-3">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={item.key === "posts" ? base : `${base}?tab=${item.key}`}
              aria-current={tab === item.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                tab === item.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      {tab === "posts" ? <PostsTab society={society} type={query.type} cursor={query.cursor} actor={actor} now={now} /> : null}
      {tab === "about" ? <AboutTab society={society} /> : null}
      {tab === "members" ? <MembersTab society={society} /> : null}
      {tab === "admin" ? <AdminTab society={society} currentUserId={session.user.id} /> : null}
    </>
  );
}

async function PostsTab({ society, type, cursor, actor, now }: { society: SocietyDetail; type?: string; cursor?: string; actor: Parameters<typeof listSocietyPosts>[0]; now: Date }) {
  const filter = type === "UPDATE" || type === "RECRUITMENT" ? type : undefined;
  const [stories, page] = await Promise.all([listSocietyStories(actor, society), listSocietyPosts(actor, society, { type: filter, cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : undefined })]);
  const base = `/societies/${society.slug}`;
  const filters = [
    { key: undefined, label: "All posts" },
    { key: "UPDATE", label: "Updates" },
    { key: "RECRUITMENT", label: "Recruitment" },
  ] as const;
  return (
    <>
      <StoriesStrip stories={stories} showSociety={false} now={now} />
      <nav aria-label="Post types" className="mb-4 flex gap-2 overflow-x-auto">
        {filters.map((item) => (
          <Link
            key={item.label}
            href={item.key ? `${base}?type=${item.key}` : base}
            aria-current={filter === item.key ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              filter === item.key ? "border-brand bg-brand text-brand-foreground" : "border-line bg-surface text-ink hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {page.posts.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">No posts yet.</p>
      ) : (
        <ul className="space-y-4">
          {page.posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} now={now} />
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <div className="mt-4">
          <Button asChild variant="secondary">
            <Link href={`${base}?${new URLSearchParams({ ...(filter ? { type: filter } : {}), cursor: page.nextCursor }).toString()}`}>Older posts</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function PeopleList({ people, empty }: { people: SocietyDetail["heads"]; empty: string }) {
  if (people.length === 0) return <p className="mt-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="mt-3 space-y-3">
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-3">
          <SocietyAvatar name={person.name} size="sm" className="rounded-full" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
            {person.position ? <span className="block text-xs text-muted">{person.position}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AboutTab({ society }: { society: SocietyDetail }) {
  const links = (Object.keys(LINK_LABELS) as (keyof typeof LINK_LABELS)[]).flatMap((key) => (society.links[key] ? [{ key, url: society.links[key] }] : []));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section aria-labelledby="about-heading" className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
        <h2 id="about-heading" className="text-base font-semibold text-ink">
          About
        </h2>
        {society.description ? (
          <p className="mt-2 text-sm whitespace-pre-line text-ink [overflow-wrap:anywhere]">{society.description}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">This society has not added a description yet.</p>
        )}
        {links.length || society.contactEmail ? (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {links.map((link) => (
              <li key={link.key}>
                <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 text-brand underline-offset-4 hover:underline">
                  <Globe className="size-4" aria-hidden />
                  {LINK_LABELS[link.key]}
                </a>
              </li>
            ))}
            {society.contactEmail ? (
              <li>
                <a href={`mailto:${society.contactEmail}`} className="inline-flex min-h-11 items-center gap-1 text-brand underline-offset-4 hover:underline">
                  <AtSign className="size-4" aria-hidden />
                  {society.contactEmail}
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}
        <p className="mt-4 text-xs text-muted">On Thapar SNS since {formatDate(society.createdAt)}.</p>
        {society.sourceUrl ? (
          <p className="mt-1 text-xs text-muted">
            Profile information as published in the official{" "}
            <a href={OFFICIAL_DIRECTORY} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-brand underline underline-offset-4">
              Thapar student societies directory
            </a>
            {society.sourceFetchedAt ? ` (retrieved ${formatDate(society.sourceFetchedAt)})` : ""}
            {society.logoSourceUrl && society.logoAssetId ? ", including the logo" : ""}.
            {society.sourceLabel ? ` Listed there as: ${society.sourceLabel}.` : ""}
          </p>
        ) : null}
      </section>
      <div className="space-y-6">
        <section aria-labelledby="heads-heading" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="heads-heading" className="text-base font-semibold text-ink">
            Heads
          </h2>
          <PeopleList people={society.heads} empty="No Head assigned yet." />
        </section>
        {society.coreMembers.length ? (
          <section aria-labelledby="core-heading" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="core-heading" className="text-base font-semibold text-ink">
              Core members
            </h2>
            <PeopleList people={society.coreMembers} empty="" />
          </section>
        ) : null}
        {/* Verified or officially matched associations only reach non-admins (filtered on the server). */}
        {society.faculty.some((person) => person.verified || person.official) ? (
          <section aria-labelledby="faculty-heading" className="rounded-xl border border-line bg-surface p-5">
            <h2 id="faculty-heading" className="text-base font-semibold text-ink">
              Faculty
            </h2>
            <p className="mb-3 text-xs text-muted">As listed by the official directories. Faculty roles are shown for information only.</p>
            <FacultyList societyId={society.id} faculty={society.faculty.filter((person) => person.verified || person.official)} review={false} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

async function MembersTab({ society }: { society: SocietyDetail }) {
  const members = (await listSocietyMembers(society)) ?? [];
  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="mb-3 text-base font-semibold text-ink">
        Members ({members.length})
      </h2>
      <MembersList societyId={society.id} members={members} manage={false} positionMax={POSITION_MAX} />
    </section>
  );
}

// Platform oversight and recovery (not acting as the society): status, Heads, faculty review.
async function AdminTab({ society, currentUserId }: { society: SocietyDetail; currentUserId: string }) {
  const heads = await listSocietyHeads(society);
  return (
    <div className="space-y-8">
      <AdminPanel societyId={society.id} isActive={society.isActive} headCount={society.headCount} verified={society.verified} />
      <section aria-labelledby="admin-heads" className="space-y-2">
        <h2 id="admin-heads" className="text-lg font-semibold text-ink">
          Heads (administrator recovery)
        </h2>
        <HeadsPanel
          societyId={society.id}
          societySlug={society.slug}
          societyName={society.name}
          heads={headRows(heads ?? { active: [], history: [] })}
          currentUserId={currentUserId}
          mode="admin"
          societyActive={society.isActive}
        />
      </section>
      <section aria-labelledby="admin-faculty" className="space-y-2 rounded-xl border border-line bg-surface p-5">
        <h2 id="admin-faculty" className="text-base font-semibold text-ink">
          Faculty associations
        </h2>
        {society.faculty.length === 0 ? (
          <p className="text-sm text-muted">None recorded.</p>
        ) : (
          <FacultyList societyId={society.id} faculty={society.faculty} review />
        )}
        {society.sourceUrl ? <p className="text-xs text-muted">Source: {society.sourceUrl}</p> : null}
      </section>
    </div>
  );
}
