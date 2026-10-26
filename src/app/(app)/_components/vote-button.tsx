"use client";

// One upvote per student (FR-MAT-4, OI-22): PUT adds, DELETE removes; the server keeps the count.
import { ThumbsUp } from "lucide-react";
import { useState } from "react";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

export function VoteButton({ url, voted, count }: { url: string; voted: boolean; count: number }) {
  const [state, setState] = useState({ voted, count });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={state.voted ? "primary" : "secondary"}
        aria-pressed={state.voted}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await callApi<{ upvoteCount: number; voted: boolean }>(state.voted ? "DELETE" : "PUT", url);
          setPending(false);
          if (result.ok) setState({ voted: result.data.voted, count: result.data.upvoteCount });
          else setError(result.message);
        }}
      >
        <ThumbsUp aria-hidden />
        <span>{state.count}</span>
        <span className="sr-only">{state.voted ? "upvotes, remove your upvote" : "upvotes, upvote"}</span>
      </Button>
      {error ? <span className="text-xs text-brand" role="alert">{error}</span> : null}
    </span>
  );
}
