import { calendarApi } from "@/modules/calendar";

export const dynamic = "force-dynamic";

/** OI-25: authenticated .ics download. */
export async function GET(request: Request) {
  return calendarApi.exportIcs(request);
}
