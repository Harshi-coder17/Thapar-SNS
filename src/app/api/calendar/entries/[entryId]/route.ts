import { calendarApi } from "@/modules/calendar";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ entryId: string }> };

export async function PUT(request: Request, { params }: Context) {
  return calendarApi.update(request, (await params).entryId);
}

export async function DELETE(request: Request, { params }: Context) {
  return calendarApi.remove(request, (await params).entryId);
}
