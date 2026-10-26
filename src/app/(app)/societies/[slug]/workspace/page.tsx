import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listSocietyPosts, listSocietyStories } from "@/modules/societies";
import { Button } from "@/shared/ui/button";

import { DeletePostButton } from "../../_components/delete-post-button";
import { PostCard, StoriesStrip } from "../../_components/post-card";
import { loadWorkspace } from "../load";

export const metadata: Metadata = { title: "Society workspace" };

type SearchParams = Promise<{ cursor?: string }>;

// Workspace posts: drafts and published posts, with the Head who posted each (visible to Heads only).
export default async function WorkspacePostsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { actor, society } = await loadWorkspace((await params).slug);
  const { cursor } = await searchParams;
  const [stories, page] = await Promise.all([listSocietyStories(actor, society), listSocietyPosts(actor, society, { cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : undefined })]);
  const base = `/societies/${society.slug}/workspace`;
  const now = new Date();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Posts</h2>
        {society.can["posts.create"] ? (
          <Button asChild>
            <Link href={`${base}/posts/new`}>
              <Plus aria-hidden />
              New post
            </Link>
          </Button>
        ) : null}
      </div>
      <StoriesStrip stories={stories} showSociety={false} now={now} canDelete={society.can["posts.delete"]} />
      {page.posts.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">No posts yet.</p>
      ) : (
        <ul className="space-y-4">
          {page.posts.map((post) => (
            <li key={post.id} className="space-y-2">
              <PostCard post={post} now={now} />
              <div className="flex flex-wrap gap-2">
                {society.can["posts.edit"] ? (
                  <Button asChild variant="secondary" size="md">
                    <Link href={`${base}/posts/${post.id}/edit`}>
                      <Pencil aria-hidden />
                      Edit
                    </Link>
                  </Button>
                ) : null}
                {society.can["posts.delete"] ? <DeletePostButton societyId={society.id} postId={post.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <div className="mt-4">
          <Button asChild variant="secondary">
            <Link href={`${base}?cursor=${page.nextCursor}`}>Older posts</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
