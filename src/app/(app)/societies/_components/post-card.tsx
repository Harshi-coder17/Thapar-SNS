import { CalendarClock, ExternalLink, Lock, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PostView } from "@/modules/societies";
import { formatDateTime, formatRelative } from "@/shared/format";

import { DeletePostButton } from "./delete-post-button";
import { SocietyAvatar } from "../../_components/society-avatar";

const TYPE_LABEL = { UPDATE: "Update", RECRUITMENT: "Recruitment", STORY: "Story" } as const;

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "brand" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone === "brand" ? "bg-accent text-accent-foreground" : "bg-canvas text-muted"}`}>{children}</span>
  );
}

/** Recruitment facts (OI-11): roles, eligibility, deadline and the external application link. */
export function RecruitmentDetails({ post, now }: { post: PostView; now: Date }) {
  if (post.type !== "RECRUITMENT") return null;
  const closed = post.deadline !== null && post.deadline <= now;
  return (
    <dl className="mt-3 grid gap-2 rounded-lg bg-canvas p-3 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="text-xs font-semibold text-muted uppercase">Roles</dt>
        <dd className="mt-1 flex flex-wrap gap-1">
          {post.rolesSought.map((role) => (
            <span key={role} className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink">
              {role}
            </span>
          ))}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-muted uppercase">Who can apply</dt>
        <dd className="mt-1 text-ink">
          {post.eligibleYears.length ? `Year ${post.eligibleYears.join(", ")}` : "All years"}
          {" · "}
          {post.eligibleBranches.length ? post.eligibleBranches.map((branch) => branch.name).join(", ") : "All branches"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-muted uppercase">Deadline</dt>
        <dd className="mt-1 flex items-center gap-1 text-ink">
          <CalendarClock className="size-4 text-muted" aria-hidden />
          {post.deadline ? `${formatDateTime(post.deadline)}${closed ? " (closed)" : ""}` : "None"}
        </dd>
      </div>
      {post.applicationUrl && !closed ? (
        <div className="sm:col-span-2">
          <a
            href={post.applicationUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-11 items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            Apply (external link)
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
      ) : null}
    </dl>
  );
}

/** A post in a list: title, meta, excerpt. The full post is on its own page. */
export function PostCard({ post, showSociety = false, now }: { post: PostView; showSociety?: boolean; now: Date }) {
  const href = `/societies/${post.society.slug}/posts/${post.id}`;
  return (
    <article className="rounded-xl border border-line bg-surface p-5" aria-labelledby={`post-${post.id}`}>
      <div className="flex items-start gap-3">
        {showSociety ? <SocietyAvatar name={post.society.name} size="sm" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {showSociety ? (
              <Link href={`/societies/${post.society.slug}`} className="inline-flex min-h-11 min-w-11 items-center font-semibold text-ink hover:underline">
                {post.society.name}
              </Link>
            ) : null}
            <Badge tone={post.type === "RECRUITMENT" ? "brand" : "muted"}>{TYPE_LABEL[post.type]}</Badge>
            {post.visibility === "MEMBERS" ? (
              <Badge>
                <Lock className="size-3" aria-hidden />
                Members only
              </Badge>
            ) : null}
            {post.publishedAt ? <span>{formatRelative(post.publishedAt, now)}</span> : <Badge tone="brand">Draft</Badge>}
            {/* Shown as the society; the individual appears only for its Heads and platform admins. */}
            {post.author ? <span>posted by {post.author.name} (visible to Heads and admins)</span> : null}
          </div>
          <h3 id={`post-${post.id}`} className="mt-1 text-base font-semibold text-ink">
            <Link href={href} className="inline-flex min-h-11 min-w-11 items-center hover:underline focus-visible:underline focus-visible:outline-none">
              {post.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted">{post.excerpt}</p>
          <RecruitmentDetails post={post} now={now} />
        </div>
      </div>
    </article>
  );
}

/** Unexpired stories (FR-SOC-3): short public notes that disappear 24 hours after posting. */
export function StoriesStrip({
  stories,
  showSociety,
  now,
  title = "Stories",
  canDelete = false,
}: {
  stories: PostView[];
  showSociety: boolean;
  now: Date;
  title?: string;
  canDelete?: boolean;
}) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="stories-heading" className="mb-6">
      <h2 id="stories-heading" className="mb-2 text-sm font-semibold text-ink">
        <Users className="mr-2 inline size-4 align-[-2px] text-muted" aria-hidden />
        {title} <span className="font-normal text-muted">(disappear after 24 hours)</span>
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
        {stories.map((story) => (
          <li key={story.id} className="w-64 shrink-0 snap-start rounded-xl border border-brand/30 bg-accent p-4">
            <div className="flex items-center gap-2 text-xs text-accent-foreground">
              {showSociety ? (
                <Link href={`/societies/${story.society.slug}`} className="inline-flex min-h-11 min-w-11 items-center font-semibold hover:underline">
                  {story.society.name}
                </Link>
              ) : null}
              {story.publishedAt ? <span>{formatRelative(story.publishedAt, now)}</span> : null}
            </div>
            <p className="mt-2 text-sm whitespace-pre-line text-ink [overflow-wrap:anywhere]">{story.body}</p>
            {canDelete ? (
              <div className="mt-2">
                <DeletePostButton societyId={story.society.id} postId={story.id} label="Delete story" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
