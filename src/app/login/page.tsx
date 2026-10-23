import type { Metadata } from "next";
import Link from "next/link";

import { FullLogo } from "@/shared/layout/brand";
import { Button } from "@/shared/ui/button";

export const metadata: Metadata = { title: "Sign in" };

// Static layout (montage panel 1). Google sign-in is wired up in Slice 1b; the button is disabled
// until then. The campus photograph in the reference is not available as an asset, so the right
// panel uses the brand colour instead. Terms/Privacy links (gap G-01) await approval.
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col justify-center gap-8 bg-surface px-6 py-12 sm:px-12 lg:px-20">
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
          <Button className="w-full" disabled aria-describedby="signin-status">
            Sign in with Google
          </Button>
          <p className="text-center text-xs text-muted">Only @thapar.edu accounts are allowed.</p>
          <p id="signin-status" className="rounded-lg bg-canvas px-3 py-2 text-center text-xs text-muted">
            Sign-in is not available yet (planned for Slice 1b).
          </p>
        </div>
        <div className="space-y-1 text-xs text-muted">
          <p>Unofficial student project. Not affiliated with or endorsed by Thapar Institute of Engineering and Technology.</p>
          <Link href="/" className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
            Continue to the app preview
          </Link>
        </div>
      </main>
      <div aria-hidden className="hidden bg-gradient-to-br from-brand to-brand-hover lg:block" />
    </div>
  );
}
