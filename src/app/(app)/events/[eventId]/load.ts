import { notFound } from "next/navigation";
import { cache } from "react";

import { getEvent, pageActor } from "@/modules/events";

import { requireSession } from "../../_lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The event as the signed-in user may see it. Society events are managed in the personal capacity
 * (by an active Head of the society); campus events in the platform capacity (admins). A draft is a
 * 404 for anyone who cannot manage it.
 */
export const loadEvent = cache(async (eventId: string) => {
  const session = await requireSession();
  if (!UUID.test(eventId)) notFound();
  const personal = pageActor(session);
  let event = await getEvent(personal, eventId);
  let asAdmin = false;
  if (session.user.role === "ADMIN") {
    const platform = pageActor(session, "platform");
    const adminView = await getEvent(platform, eventId);
    if (adminView && (!event || (adminView.society === null && adminView.canManage))) {
      event = adminView;
      asAdmin = true;
    }
  }
  if (!event) notFound();
  return { session, event, asAdmin };
});
