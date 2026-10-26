import type { Metadata } from "next";
import Link from "next/link";

import { MAX_SCREENSHOTS, MAX_TAGS } from "@/modules/archive";
import { PageHeader } from "@/shared/layout/page-header";

import { requireSession } from "../../_lib/session";
import { SubmitForm } from "../_components/submit-form";

export const metadata: Metadata = { title: "Submit a project" };

export default async function SubmitProjectPage() {
  await requireSession();
  return (
    <>
      <Link href="/archive" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
        Back to Archive
      </Link>
      <PageHeader title="Submit a project" description="An administrator reviews every project before it is published. Only you can see it until then." />
      <SubmitForm maxShots={MAX_SCREENSHOTS} maxTags={MAX_TAGS} />
    </>
  );
}
