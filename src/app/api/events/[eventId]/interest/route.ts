import { eventsApi } from "@/modules/events";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return eventsApi.interest(request, (await params).eventId);
}

export async function GET(request: Request, { params }: Context) {
  return eventsApi.interestCount(request, (await params).eventId);
}
