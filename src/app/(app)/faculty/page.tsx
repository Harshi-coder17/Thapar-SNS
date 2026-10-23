import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Faculty" };

export default function FacultyPage() {
  return <ModulePlaceholder href="/faculty" />;
}
