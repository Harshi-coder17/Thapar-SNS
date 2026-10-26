import { handleUploadIntent } from "@/modules/assets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleUploadIntent(request);
}
