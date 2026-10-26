import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { type CurrentSession, getCurrentSession, hasSessionCookie } from "@/modules/identity";

/** The session for this request, read once per render (React cache). */
export const currentSession = cache(async (): Promise<CurrentSession | null> => getCurrentSession(await headers()));

/**
 * The signed-in user with a completed profile, or a redirect. Pages call this themselves: Next.js
 * may render a page in parallel with its layout, so the layout's check alone is not enough.
 */
export async function requireSession(): Promise<CurrentSession> {
  const session = await currentSession();
  if (!session) {
    // A session cookie without a valid session: it ended (inactivity, time limit, sign-out elsewhere or
    // revocation). Say so on the login page instead of silently showing it.
    const names = (await cookies()).getAll().map((cookie) => cookie.name);
    redirect(hasSessionCookie(names) ? "/login?reason=expired" : "/login");
  }
  if (!session.profileComplete) redirect("/onboarding");
  return session;
}
