import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { activeBranches, MAX_ROLES_SOUGHT, POST_BODY_MAX, POST_TITLE_MAX, STORY_MAX } from "@/modules/societies";

import { PostEditor } from "../../../../_components/post-editor";
import { loadWorkspace } from "../../../load";

export const metadata: Metadata = { title: "New post" };

// FR-SOC-3 / UCD-5: any Head publishes as the society. The API re-checks the Head grant.
export default async function NewPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { society } = await loadWorkspace((await params).slug);
  if (!society.can["posts.create"]) notFound();
  const branches = await activeBranches();
  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">New post</h2>
      <PostEditor
        society={{ id: society.id, slug: society.slug }}
        returnTo={`/societies/${society.slug}/workspace`}
        branches={branches}
        limits={{ title: POST_TITLE_MAX, body: POST_BODY_MAX, story: STORY_MAX, roles: MAX_ROLES_SOUGHT }}
      />
    </div>
  );
}
