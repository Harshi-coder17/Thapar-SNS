import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Events" };

export default function EventsPage() {
  return <ModulePlaceholder href="/events" />;
}
