import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Archive" };

export default function ArchivePage() {
  return <ModulePlaceholder href="/archive" />;
}
