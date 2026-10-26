import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { activeBranches, getSocietyPost, MAX_ROLES_SOUGHT, POST_BODY_MAX, POST_TITLE_MAX, STORY_MAX } from "@/modules/societies";

import { PostEditor } from "../../../../../_components/post-editor";
import { loadWorkspace } from "../../../../load";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ slug: string; postId: string }> }) {
  const { slug, postId } = await params;
  const { actor, society } = await loadWorkspace(slug);
  const post = await getSocietyPost(actor, society, postId);
  if (!post || post.type === "STORY" || !society.can["posts.edit"]) notFound();
  const branches = await activeBranches();
  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Edit post</h2>
      <PostEditor
        society={{ id: society.id, slug: society.slug }}
        returnTo={`/societies/${society.slug}/workspace`}
        branches={branches}
        limits={{ title: POST_TITLE_MAX, body: POST_BODY_MAX, story: STORY_MAX, roles: MAX_ROLES_SOUGHT }}
        post={{
          id: post.id,
          type: post.type,
          visibility: post.visibility,
          title: post.title,
          body: post.body,
          rolesSought: post.rolesSought,
          eligibleYears: post.eligibleYears,
          eligibleBranchCodes: post.eligibleBranches.map((branch) => branch.code),
          deadline: post.deadline?.toISOString() ?? null,
          applicationUrl: post.applicationUrl,
          published: post.publishedAt !== null,
        }}
      />
    </div>
  );
}
