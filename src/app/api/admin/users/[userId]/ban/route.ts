import { adminUsersApi } from "@/modules/identity";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, { params }: Context) {
  return adminUsersApi.ban(request, (await params).userId);
}
