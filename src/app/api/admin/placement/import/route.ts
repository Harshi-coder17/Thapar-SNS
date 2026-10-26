import { placementApi } from "@/modules/placement";

export const dynamic = "force-dynamic";

/** PLC-1 CSV import (platform capacity: ?as=admin). */
export async function POST(request: Request) {
  return placementApi.importCsv(request);
}
