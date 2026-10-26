import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentSession, MAX_SKILL_TAGS, MIN_SKILL_TAGS, profileOptions } from "@/modules/identity";
import { FullLogo } from "@/shared/layout/brand";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Complete your profile" };

// FR-AUTH-2: first-time users complete their profile before using the app. The (app) layout sends
// signed-in users with an incomplete profile here.
export default async function OnboardingPage() {
  const session = await getCurrentSession(await headers());
  if (!session) redirect("/login");
  if (session.profileComplete) redirect("/");
  const options = await profileOptions();

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <FullLogo size={56} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Complete your profile</h1>
            <p className="text-sm text-muted">Signed in as {session.user.email}</p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Your roll number is private: only you and administrators can see it. Choose {MIN_SKILL_TAGS} to {MAX_SKILL_TAGS} skills or interests so classmates
          can find you.
        </p>
        <ProfileForm defaultName={session.user.name} options={options} minTags={MIN_SKILL_TAGS} maxTags={MAX_SKILL_TAGS} />
      </div>
    </main>
  );
}
