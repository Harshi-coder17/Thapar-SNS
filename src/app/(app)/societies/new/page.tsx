import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { actorOf, canCreateSociety, DESCRIPTION_MAX, NAME_MAX, SHORT_NAME_MAX, societyCategories } from "@/modules/societies";
import { PageHeader } from "@/shared/layout/page-header";

import { requireSession } from "../../_lib/session";
import { SocietyForm } from "../_components/society-form";

export const metadata: Metadata = { title: "Create society" };

// FR-SOC-1: only administrators create societies. Others get a 404 (the API refuses them too).
export default async function NewSocietyPage() {
  const session = await requireSession();
  if (!canCreateSociety(actorOf(session))) notFound();
  const categories = await societyCategories();
  return (
    <div className="max-w-3xl">
      <Link href="/societies" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Societies
      </Link>
      <PageHeader title="Create society" description="Platform administrators create a society and appoint one or more Heads, who share its workspace." />
      <SocietyForm mode="create" categories={categories} canRename limits={{ name: NAME_MAX, description: DESCRIPTION_MAX, shortName: SHORT_NAME_MAX }} />
    </div>
  );
}
