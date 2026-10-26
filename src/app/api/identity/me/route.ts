import { handleMeRequest } from "@/modules/identity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleMeRequest(request);
}
