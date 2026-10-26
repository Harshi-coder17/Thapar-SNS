import type { Metadata } from "next";

import { listSocietyHeads } from "@/modules/societies";

import { headRows } from "../../../_components/head-rows";
import { HeadsPanel } from "../../../_components/heads-panel";
import { loadWorkspace } from "../../load";

export const metadata: Metadata = { title: "Heads" };

export default async function WorkspaceHeadsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { session, society } = await loadWorkspace((await params).slug);
  const heads = await listSocietyHeads(society);
  return (
    <HeadsPanel
      societyId={society.id}
      societySlug={society.slug}
      societyName={society.name}
      heads={headRows(heads ?? { active: [], history: [] })}
      currentUserId={session.user.id}
      mode="head"
      societyActive={society.isActive}
    />
  );
}
