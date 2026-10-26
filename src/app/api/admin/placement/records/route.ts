import { placementApi } from "@/modules/placement";

export const dynamic = "force-dynamic";

/** PLC-1 (platform capacity: ?as=admin). */
export async function POST(request: Request) {
  return placementApi.upsert(request);
}
