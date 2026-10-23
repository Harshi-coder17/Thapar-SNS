import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { primaryNav } from "@/shared/layout/nav";
import { PageHeader } from "@/shared/layout/page-header";

// Navigation cards only. Counts, feeds and other montage-only content are not built (gap list G-02..G-05).
export default function HomePage() {
  const modules = primaryNav.filter((item) => item.href !== "/");
  return (
    <>
      <PageHeader title="Welcome to Thapar SNS" description="A unified campus networking and services platform for TIET students." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex items-center gap-1 font-semibold text-ink">
                  {item.label}
                  <ArrowRight className="size-4 text-muted motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="text-sm text-muted">{item.summary}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
