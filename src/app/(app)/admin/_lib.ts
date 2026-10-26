import { notFound } from "next/navigation";

import { requireSession } from "../_lib/session";

/** Admin pages: the ADMIN role read from the database on every render; anyone else gets a 404. */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") notFound();
  return session;
}
