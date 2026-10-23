import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Placement" };

export default function PlacementPage() {
  return <ModulePlaceholder href="/placement" />;
}
