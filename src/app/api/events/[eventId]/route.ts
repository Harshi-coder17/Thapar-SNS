import { eventsApi } from "@/modules/events";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return eventsApi.update(request, (await params).eventId);
}
