import { handleAdminRevokeRequest } from "@/modules/identity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleAdminRevokeRequest(request);
}
