import { Lock, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSocietyPost } from "@/modules/societies";
import { formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/button";

import { RecruitmentDetails } from "../../../_components/post-card";
import { SocietyAvatar } from "../../../../_components/society-avatar";
import { loadSociety } from "../../load";

type Params = Promise<{ slug: string; postId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, postId } = await params;
  const { actor, society } = await loadSociety(slug);
  const post = await getSocietyPost(actor, society, postId);
  return { title: post?.title ?? society.name };
}

// A single post. Drafts and members-only posts are a 404 for people who may not see them.
export default async function PostPage({ params }: { params: Params }) {
  const { slug, postId } = await params;
  const { actor, society } = await loadSociety(slug);
  const post = await getSocietyPost(actor, society, postId);
  if (!post || post.type === "STORY") notFound();
  const now = new Date();
  return (
    <div className="max-w-3xl">
      <Link href={`/societies/${society.slug}`} className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to {society.name}
      </Link>
      <article className="rounded-xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="post-title">
        <div className="flex items-center gap-3">
          <SocietyAvatar name={society.name} size="sm" />
          <div className="text-sm">
            <Link href={`/societies/${society.slug}`} className="inline-flex min-h-11 items-center font-semibold text-ink hover:underline">
              {society.name}
            </Link>
            <p className="text-muted">
              {post.publishedAt ? formatDateTime(post.publishedAt) : "Draft (not published)"}
              {post.author ? ` · posted by ${post.author.name} (visible to Heads and admins)` : ""}
            </p>
          </div>
        </div>
        <h1 id="post-title" className="mt-4 text-2xl font-semibold tracking-tight text-ink">
          {post.title}
        </h1>
        {post.visibility === "MEMBERS" ? (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
            <Lock className="size-3" aria-hidden />
            Members only
          </p>
        ) : null}
        <RecruitmentDetails post={post} now={now} />
        {/* The body passed the server-side allow-list sanitiser on write and again on read. */}
        {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- sanitised HTML only (sanitize-html.ts) */}
        <div className="rich-text mt-4 text-base text-ink" dangerouslySetInnerHTML={{ __html: post.body }} />
        {/* Editing happens in the society workspace (acting as the society). */}
        {society.can["workspace.open"] && society.can["posts.edit"] ? (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button asChild variant="secondary" size="md">
              <Link href={`/societies/${society.slug}/workspace/posts/${post.id}/edit`}>
                <Pencil aria-hidden />
                Edit in the society workspace
              </Link>
            </Button>
          </div>
        ) : null}
      </article>
    </div>
  );
}
