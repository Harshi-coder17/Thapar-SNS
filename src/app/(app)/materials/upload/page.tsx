import type { Metadata } from "next";
import Link from "next/link";

import { profileOptions } from "@/modules/identity";
import { TYPE_LABELS } from "@/modules/studymaterial";
import { PageHeader } from "@/shared/layout/page-header";

import { requireSession } from "../../_lib/session";
import { MaterialForm } from "../_components/material-form";

export const metadata: Metadata = { title: "Share study material" };

export default async function UploadMaterialPage() {
  await requireSession();
  const { branches } = await profileOptions();
  return (
    <>
      <Link href="/materials" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Study Material
      </Link>
      <PageHeader title="Share study material" description="Files are checked automatically before they are listed. You can follow the status under My uploads." />
      <MaterialForm branches={branches} types={TYPE_LABELS} />
    </>
  );
}
