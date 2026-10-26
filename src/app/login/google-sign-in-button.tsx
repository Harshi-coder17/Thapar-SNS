"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";

/**
 * Starts the Google OAuth redirect flow (Better Auth /sign-in/social). The server returns Google's
 * authorization URL; state and PKCE are handled server-side.
 */
export function GoogleSignInButton({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    }).catch(() => null);
    const data = response?.ok ? ((await response.json().catch(() => null)) as { url?: unknown } | null) : null;
    if (data && typeof data.url === "string" && data.url.startsWith("https://accounts.google.com/")) {
      window.location.assign(data.url);
      return;
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={signIn} disabled={!configured || pending} aria-describedby="signin-status">
        {pending ? "Redirecting to Google..." : "Sign in with Google"}
      </Button>
      {failed ? (
        <p role="alert" className="text-center text-xs text-brand">
          Could not start sign-in. Please try again.
        </p>
      ) : null}
    </div>
  );
}
