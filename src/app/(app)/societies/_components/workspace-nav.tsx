"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/ui/cn";

const TABS = [
  { href: "", label: "Posts" },
  { href: "/events", label: "Events" },
  { href: "/members", label: "Members" },
  { href: "/heads", label: "Heads" },
  { href: "/profile", label: "Profile" },
] as const;

export function WorkspaceNav({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = tab.href === "" ? pathname === base || pathname.startsWith(`${base}/posts`) : pathname.startsWith(href);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
              active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
