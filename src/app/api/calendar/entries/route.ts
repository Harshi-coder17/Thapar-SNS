import { calendarApi } from "@/modules/calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return calendarApi.create(request);
}
