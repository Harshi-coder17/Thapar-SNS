import { sessionApi } from "@/modules/identity";

export const dynamic = "force-dynamic";

/** The user is present: extends the inactivity limit (never the absolute one). */
export async function POST(request: Request) {
  return sessionApi.activity(request);
}
