import type { Metadata } from "next";
import Link from "next/link";

import { archive } from "@/modules/archive";
import { formatDate } from "@/shared/format";

import { EmptyState } from "../../_components/empty-state";
import { ReviewProject } from "../_components/admin-actions";
import { requireAdmin } from "../_lib";

export const metadata: Metadata = { title: "Archive reviews" };

// FR-ARC-2 / OI-21: projects stay invisible until an administrator approves them.
export default async function ArchiveReviewPage() {
  const session = await requireAdmin();
  const queue = await archive.list(session.user.id, { view: "queue" });
  return queue.length === 0 ? (
    <EmptyState>No projects are waiting for review.</EmptyState>
  ) : (
    <ul className="space-y-3">
      {queue.map((p) => (
        <li key={p.id} className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <Link href={`/archive/${p.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
            {p.title}
          </Link>
          <p className="text-sm text-muted">
            {p.submitterName ?? "Former user"} · {formatDate(p.createdAt)} · {p.tags.join(", ")}
          </p>
          <p className="text-sm text-ink">{p.excerpt}</p>
          <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline-offset-4 hover:underline">
            {p.githubUrl}
          </a>
          <ReviewProject projectId={p.id} />
        </li>
      ))}
    </ul>
  );
}
