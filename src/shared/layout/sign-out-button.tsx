"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

/** Ends the session on the server (Better Auth sign-out, origin-checked), then goes to /login. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    if (response?.ok) {
      router.replace("/login");
      router.refresh();
      return;
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div>
      <Button variant="secondary" className="w-full" onClick={signOut} disabled={pending}>
        <LogOut aria-hidden />
        {pending ? "Signing out..." : "Sign out"}
      </Button>
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-brand">
          Sign-out failed. Please try again.
        </p>
      ) : null}
    </div>
  );
}
