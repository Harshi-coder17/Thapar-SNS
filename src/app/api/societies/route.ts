import { societiesApi } from "@/modules/societies";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return societiesApi().createSociety(request);
}
