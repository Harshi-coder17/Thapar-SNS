import { eventsApi } from "@/modules/events";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  return eventsApi.publish(request, (await params).eventId);
}
