import type { Metadata } from "next";

import { ModulePlaceholder } from "@/shared/layout/module-placeholder";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <ModulePlaceholder href="/notifications" />;
}
