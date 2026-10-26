import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";

import { describeSignInError, getCurrentSession, isGoogleSignInConfigured } from "@/modules/identity";
import { FullLogo } from "@/shared/layout/brand";

import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

// Montage panel 1. The campus photograph (public/brand/login-campus.jpg: the owner's project-docs/tiet.jxl,
// decoded and re-encoded as JPEG because JPEG XL does not work in Chrome or Firefox; Next.js serves it as
// AVIF or WebP where supported) sits
// on the right and fades into the page background from right to left through a CSS mask, so there is
// no hard-edged box; on small screens it is a top band that fades downward. Until the file exists the
// brand-colour panel is shown. Terms/Privacy links (gap G-01) await approval.
const PHOTO = "/brand/login-campus.jpg";
const hasPhoto = () => existsSync(join(process.cwd(), "public", PHOTO));
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; reason?: string | string[] }> }) {
  const configured = isGoogleSignInConfigured();
  if (configured && (await getCurrentSession(await headers()))) redirect("/");
  const { error, reason } = await searchParams;
  const errorMessage = describeSignInError(Array.isArray(error) ? error[0] : error);
  const reasonValue = Array.isArray(reason) ? reason[0] : reason;
  // Session policy (docs/auth/session-policy.md): why the student was signed out.
  const reasonMessage =
    reasonValue === "expired"
      ? "You were signed out for your security: computers sign out after 30 minutes without activity or 12 hours after signing in, phones after 7 days without activity or 30 days. Sign in again to continue; drafts that could be saved will be waiting."
      : reasonValue === "signed-out"
        ? "You have signed out."
        : null;

  const photo = hasPhoto();

  return (
    <div className={photo ? "relative min-h-dvh overflow-hidden bg-surface" : "grid min-h-dvh lg:grid-cols-2"}>
      {photo ? (
        <div aria-hidden className="login-photo pointer-events-none absolute inset-x-0 top-0 h-56 sm:h-72 lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-[62%]">
          <Image src={PHOTO} alt="" fill priority sizes="(min-width: 1024px) 62vw, 100vw" className="object-cover object-[62%_center]" />
        </div>
      ) : null}
      <main className={photo ? "relative flex min-h-dvh flex-col justify-center gap-8 px-6 pt-60 pb-12 sm:px-12 sm:pt-80 lg:max-w-[48%] lg:px-20 lg:py-12" : "flex flex-col justify-center gap-8 bg-surface px-6 py-12 sm:px-12 lg:px-20"}>
        <FullLogo size={96} />
        <div>
          <p className="text-lg font-semibold text-brand">Thapar SNS</p>
          <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight text-ink">
            Your Campus.
            <br />
            Your People.
            <br />
            Your Platform.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted">A unified campus networking and services platform for TIET students.</p>
        </div>
        <div className="max-w-sm space-y-3">
          {reasonMessage && !errorMessage ? (
            <p role="status" className="rounded-lg border border-line bg-canvas px-3 py-2 text-center text-sm text-ink">
              {reasonMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p role="alert" className="rounded-lg border border-brand/30 bg-accent px-3 py-2 text-center text-sm text-accent-foreground">
              {errorMessage}
            </p>
          ) : null}
          <GoogleSignInButton configured={configured} />
          <p id="signin-status" className="text-center text-xs text-muted">
            {configured ? "Only @thapar.edu accounts are allowed." : "Google sign-in is not configured on this server yet. Only @thapar.edu accounts will be allowed."}
          </p>
        </div>
        <p className="text-xs text-muted">Unofficial student project. Not affiliated with or endorsed by Thapar Institute of Engineering and Technology.</p>
      </main>
      {photo ? null : <div aria-hidden className="hidden bg-gradient-to-br from-brand to-brand-hover lg:block" />}
    </div>
  );
}
