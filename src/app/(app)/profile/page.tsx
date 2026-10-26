import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { myRegistrationCount } from "@/modules/events";
import { browseRequests } from "@/modules/findmates";
import { MAX_SKILL_TAGS, MIN_SKILL_TAGS, profileOptions, publicProfile } from "@/modules/identity";
import { membershipsOf } from "@/modules/societies";

import { ProfileCard } from "../_components/profile-card";
import { requireSession } from "../_lib/session";
import { EditProfile } from "./edit-profile";

export const metadata: Metadata = { title: "Your profile" };

// UCD-2 / OI-35: your profile as others see it, your activity, and editing. The roll number is private.
export default async function ProfilePage() {
  const session = await requireSession();
  const [profile, memberships, registered, options, requests] = await Promise.all([publicProfile(session.user.id), membershipsOf(session.user.id), myRegistrationCount(session.user.id), profileOptions(), browseRequests(session.user.id, { view: "mine" })]);
  if (!profile) notFound();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <ProfileCard profile={profile} memberships={memberships} registeredEvents={registered} />
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold text-ink">Your activity</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/events?view=mine" className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline">
                Your event registrations
              </Link>
            </li>
            <li>
              <Link href="/mates?view=mine" className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline">
                Your teammate requests ({requests.length})
              </Link>
            </li>
            <li>
              <Link href="/materials?view=mine" className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline">
                Your study material uploads
              </Link>
            </li>
            <li>
              <Link href="/archive?view=mine" className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline">
                Your archive projects
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">Signed in as {session.user.email}. Your roll number is private and visible only to you and administrators.</p>
        </section>
      </div>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-lg font-semibold text-ink">Edit profile</h2>
        <EditProfile initial={{ name: profile.name, branchCode: profile.branchCode ?? options.branches[0]?.code ?? "", year: profile.year ?? 1, tags: profile.skills.map((s) => s.slug) }} branches={options.branches} tags={options.tags} limits={{ min: MIN_SKILL_TAGS, max: MAX_SKILL_TAGS }} />
      </section>
    </div>
  );
}
