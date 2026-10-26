import { eventsApi } from "@/modules/events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return eventsApi.create(request);
}
