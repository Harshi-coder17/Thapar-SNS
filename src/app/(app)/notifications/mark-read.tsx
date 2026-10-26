"use client";

import { useRouter } from "next/navigation";

import { callApi } from "@/shared/http/api-client";
import { Button } from "@/shared/ui/button";

import { useApiAction } from "../_components/use-api-action";

export function MarkAllRead() {
  const { run, pending } = useApiAction();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => void run("POST", "/api/notifications", { all: true })}>
      Mark all as read
    </Button>
  );
}

/** Opens the notification's page and marks it read. */
export function MarkReadLink({ id, href, unread, title }: { id: string; href: string; unread: boolean; title: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      className="flex min-h-11 items-center font-medium text-ink underline-offset-4 hover:underline"
      onClick={async (event) => {
        if (!unread) return;
        event.preventDefault();
        await callApi("POST", "/api/notifications", { ids: [id] });
        router.push(href);
        router.refresh();
      }}
    >
      {title}
    </a>
  );
}
