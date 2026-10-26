"use client";

import { Building2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/ui/cn";

/** A society workspace the signed-in user may switch into (an active Head grant, read on the server). */
export interface ManagedSociety {
  slug: string;
  name: string;
}

export const workspacePath = (slug: string) => `/societies/${slug}/workspace`;

/**
 * Identity switcher (ADR-0013 §3.3): the personal account plus every society the user is a Head of.
 * Switching only navigates: the society context travels in each request's URL and the server checks
 * the Head grant on every request, so this list is a convenience, never a permission.
 */
export function IdentitySwitcher({ personalName, societies, onNavigate }: { personalName: string; societies: ManagedSociety[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  if (societies.length === 0) return null;
  const actingFor = societies.find((society) => pathname === workspacePath(society.slug) || pathname.startsWith(`${workspacePath(society.slug)}/`));
  const item = (active: boolean) =>
    cn(
      "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
      active ? "bg-accent font-medium text-accent-foreground" : "text-ink/80 hover:bg-canvas hover:text-ink",
    );
  return (
    <nav aria-label="Switch identity" className="space-y-1">
      <p className="px-3 text-xs font-semibold tracking-wide text-muted uppercase">Acting as</p>
      <ul className="space-y-0.5">
        <li>
          <Link href="/" onClick={onNavigate} aria-current={actingFor ? undefined : "true"} className={item(!actingFor)}>
            <UserRound className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{personalName} (personal)</span>
          </Link>
        </li>
        {societies.map((society) => {
          const active = actingFor?.slug === society.slug;
          return (
            <li key={society.slug}>
              <Link href={workspacePath(society.slug)} onClick={onNavigate} aria-current={active ? "true" : undefined} className={item(active)}>
                <Building2 className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{society.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
