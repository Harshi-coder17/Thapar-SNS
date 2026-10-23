import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Study Material" };

export default function StudyMaterialPage() {
  return <ModulePlaceholder href="/materials" />;
}
