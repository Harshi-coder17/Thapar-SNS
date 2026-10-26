import type { Metadata } from "next";

import { DESCRIPTION_MAX, NAME_MAX, SHORT_NAME_MAX, societyCategories } from "@/modules/societies";

import { SocietyForm } from "../../../_components/society-form";
import { SocietyImages } from "../../../_components/society-images";
import { loadWorkspace } from "../../load";

export const metadata: Metadata = { title: "Society profile" };

export default async function WorkspaceProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { society } = await loadWorkspace((await params).slug);
  if (!society.can["society.editProfile"]) {
    return <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">The profile cannot be edited while the society is inactive.</p>;
  }
  const categories = await societyCategories();
  return (
    <div className="max-w-3xl">
      <SocietyImages societyId={society.id} logoAssetId={society.logoAssetId} bannerAssetId={society.bannerAssetId} />
      <h2 className="mb-1 text-lg font-semibold text-ink">Society profile</h2>
      <p className="mb-4 text-sm text-muted">Only a platform administrator can rename the society: its name is its identity.</p>
      <SocietyForm
        mode="edit"
        categories={categories}
        canRename={society.can["society.rename"]}
        initial={{
          id: society.id,
          slug: society.slug,
          name: society.name,
          shortName: society.shortName,
          description: society.description,
          categorySlug: society.category?.slug ?? null,
          links: society.links,
          contactEmail: society.contactEmail,
        }}
        limits={{ name: NAME_MAX, description: DESCRIPTION_MAX, shortName: SHORT_NAME_MAX }}
      />
    </div>
  );
}
