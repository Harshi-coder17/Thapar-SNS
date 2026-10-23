import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <ModulePlaceholder href="/calendar" />;
}
