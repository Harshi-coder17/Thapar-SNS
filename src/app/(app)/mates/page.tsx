import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Find Mates" };

export default function FindMatesPage() {
  return <ModulePlaceholder href="/mates" />;
}
