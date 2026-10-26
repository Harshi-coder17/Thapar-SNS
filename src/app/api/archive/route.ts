import { archiveApi } from "@/modules/archive";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return archiveApi.submit(request);
}
