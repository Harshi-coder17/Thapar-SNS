import { eventsApi } from "@/modules/events";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

/** UC-07: register (idempotent; returns the existing registration if any). */
export async function POST(request: Request, { params }: Context) {
  return eventsApi.register(request, (await params).eventId);
}

/** OI-14: cancel one's own registration before the start. */
export async function DELETE(request: Request, { params }: Context) {
  return eventsApi.cancelRegistration(request, (await params).eventId);
}
