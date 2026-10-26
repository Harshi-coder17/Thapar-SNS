import { handleAuthRequest } from "@/modules/identity";

// Better Auth endpoints. Only allow-listed requests reach Better Auth (identity request-guard, C3).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAuthRequest(request);
}

export async function POST(request: Request) {
  return handleAuthRequest(request);
}
