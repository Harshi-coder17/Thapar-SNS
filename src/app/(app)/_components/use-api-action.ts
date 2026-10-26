"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { type ApiResult, callApi } from "@/shared/http/api-client";

/** Runs an API call, then refreshes the server-rendered page; exposes pending and error state. */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<ApiResult<T>> {
    setPending(true);
    setError(null);
    const result = await callApi<T>(method, url, body);
    if (result.ok) router.refresh();
    else setError(Object.values(result.fields)[0] ?? result.message);
    setPending(false);
    return result;
  }

  return { run, pending, error, setError };
}
