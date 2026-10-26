import { initials } from "@/shared/format";
import { cn } from "@/shared/ui/cn";

import { FallbackImage } from "./fallback-image";

// Society logo (Slice 2d): the approved upload's thumbnail, served through /api/assets (signed,
// short-lived storage URL). Without an approved logo the society's initials are shown.
export function SocietyAvatar({ name, logoAssetId, size = "md", className }: { name: string; logoAssetId?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-10 text-sm", md: "size-12 text-base", lg: "size-20 text-2xl" };
  const placeholder = (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-xl bg-accent font-bold text-accent-foreground", sizes[size], className)}>
      {initials(name)}
    </span>
  );
  if (!logoAssetId) return placeholder;
  return <FallbackImage src={`/api/assets/${logoAssetId}/file?variant=thumbnail`} className={cn("shrink-0 rounded-xl border border-line bg-surface object-contain", sizes[size], className)} fallback={placeholder} />;
}
