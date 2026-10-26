import { initials } from "@/shared/format";
import { cn } from "@/shared/ui/cn";

import { FallbackImage } from "../../_components/fallback-image";

/** Official directory photo (imported and checked like any upload), or initials. */
export function FacultyPhoto({ name, photoAssetId, size = "md" }: { name: string; photoAssetId: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-28 text-3xl" : "size-14 text-lg";
  const placeholder = (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground", box)}>
      {initials(name.replace(/^(Dr|Prof|Professor|Mr|Ms|Mrs|Er)\.?\s+/i, ""))}
    </span>
  );
  if (!photoAssetId) return placeholder;
  return <FallbackImage src={`/api/assets/${photoAssetId}/file?variant=thumbnail`} className={cn("shrink-0 rounded-full border border-line object-cover", box)} fallback={placeholder} />;
}
