import { matesApi } from "@/modules/findmates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return matesApi.create(request);
}
