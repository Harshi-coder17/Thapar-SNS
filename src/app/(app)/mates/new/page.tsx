import type { Metadata } from "next";
import Link from "next/link";

import { MAX_EXPIRY_DAYS, MAX_SKILLS } from "@/modules/findmates";
import { profileOptions } from "@/modules/identity";
import { PageHeader } from "@/shared/layout/page-header";

import { requireSession } from "../../_lib/session";
import { MateForm } from "../_components/mate-form";

export const metadata: Metadata = { title: "New teammate request" };

export default async function NewMateRequestPage() {
  await requireSession();
  const { tags } = await profileOptions();
  const defaultExpiry = new Date(new Date().getTime() + 14 * 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  return (
    <>
      <Link href="/mates" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Find Mates
      </Link>
      <PageHeader title="New teammate request" description="Describe your idea and the skills you need. Students who match can respond." />
      <MateForm tags={tags} maxSkills={MAX_SKILLS} maxDays={MAX_EXPIRY_DAYS} defaultExpiry={defaultExpiry} />
    </>
  );
}
