"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/ui/cn";

import { adminNav, isActive, primaryNav, secondaryNav } from "./nav";

const SECTIONS = { primary: primaryNav, secondary: secondaryNav, admin: adminNav } as const;

/**
 * Navigation list. The active item always matches the current route (fixes montage panels 6, 7, 9).
 * Takes a section name rather than the items: icons are components and cannot be passed from
 * Server Components to this Client Component.
 */
export function SidebarNav({ section, label, onNavigate, badges = {} }: { section: keyof typeof SECTIONS; label: string; onNavigate?: () => void; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const items = SECTIONS[section];
  return (
    <nav aria-label={label}>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                  active ? "bg-accent text-accent-foreground" : "text-ink/80 hover:bg-canvas hover:text-ink",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {item.label}
                {badges[item.href] ? (
                  <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
                    {badges[item.href]! > 99 ? "99+" : badges[item.href]}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
