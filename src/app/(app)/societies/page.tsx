import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Societies" };

export default function SocietiesPage() {
  return <ModulePlaceholder href="/societies" />;
}
