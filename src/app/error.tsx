"use client";

import { Button } from "@/shared/ui/button";

// Generic message only: error details are never shown to users (threat model §3).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="text-sm text-muted">Please try again. If the problem continues, come back later.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
