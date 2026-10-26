import { materialsApi } from "@/modules/studymaterial";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return materialsApi.create(request);
}
