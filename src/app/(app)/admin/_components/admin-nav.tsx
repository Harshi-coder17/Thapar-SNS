"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/ui/cn";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/claims", label: "Faculty claims" },
  { href: "/admin/archive", label: "Archive reviews" },
  { href: "/admin/placement", label: "Placement data" },
  { href: "/admin/outbox", label: "Background jobs" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
