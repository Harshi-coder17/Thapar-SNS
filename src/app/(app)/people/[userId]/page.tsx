import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { myRegistrationCount } from "@/modules/events";
import { publicProfile } from "@/modules/identity";
import { membershipsOf } from "@/modules/societies";

import { ProfileCard } from "../../_components/profile-card";
import { requireSession } from "../../_lib/session";

export const metadata: Metadata = { title: "Profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UCD-2: another student's public profile (no roll number, no email; OI-27).
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requireSession();
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();
  if (userId === session.user.id) redirect("/profile");
  const [profile, memberships, registered] = await Promise.all([publicProfile(userId), membershipsOf(userId), myRegistrationCount(userId)]);
  if (!profile) notFound();
  return (
    <div className="max-w-2xl">
      <ProfileCard profile={profile} memberships={memberships} registeredEvents={registered} />
    </div>
  );
}
