import { sessionApi } from "@/modules/identity";

export const dynamic = "force-dynamic";

/** When the current session ends (read only). */
export async function GET(request: Request) {
  return sessionApi.status(request);
}
