"use client";

// Slice 2d: a Head sets or clears the society logo and banner. Files go through the quarantine-first
// pipeline; the page shows them once approved.
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { FormAlert } from "../../_components/form-fields";
import { FileUpload } from "../../_components/file-upload";
import { useApiAction } from "../../_components/use-api-action";

export function SocietyImages({ societyId, logoAssetId, bannerAssetId, asAdmin = false }: { societyId: string; logoAssetId: string | null; bannerAssetId: string | null; asAdmin?: boolean }) {
  const { run, error } = useApiAction();
  const [notice, setNotice] = useState<string | null>(null);
  const url = `/api/societies/${societyId}/image${asAdmin ? "?as=admin" : ""}`;
  const set = async (kind: "logo" | "banner", assetId: string | null) => {
    setNotice(null);
    const result = await run("PUT", url, { kind, assetId });
    if (result.ok) setNotice(assetId ? `The new ${kind} is saved and will show once it has been checked.` : `The ${kind} was removed.`);
  };
  return (
    <section aria-labelledby="images-title" className="mb-8 space-y-5 rounded-xl border border-line bg-surface p-5">
      <h2 id="images-title" className="text-lg font-semibold text-ink">
        Logo and banner
      </h2>
      <FormAlert message={error} />
      {notice ? <p role="status" className="text-sm text-ink">{notice}</p> : null}
      {(["logo", "banner"] as const).map((kind) => {
        const current = kind === "logo" ? logoAssetId : bannerAssetId;
        return (
          <div key={kind} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs
              <img src={`/api/assets/${current}/file?variant=thumbnail`} alt={`Current ${kind}`} className={kind === "logo" ? "size-20 rounded-xl border border-line object-contain" : "h-20 w-48 rounded-lg border border-line object-cover"} />
            ) : (
              <span className="flex h-20 w-48 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">No {kind}</span>
            )}
            <div className="space-y-2">
              <FileUpload
                purpose={kind === "logo" ? "SOCIETY_LOGO" : "SOCIETY_BANNER"}
                accept="image/png,image/jpeg"
                label={kind === "logo" ? "Upload a logo" : "Upload a banner"}
                hint={kind === "logo" ? "PNG or JPEG, up to 2 MB. A square image works best." : "PNG or JPEG, up to 5 MB. A wide image (about 4:1) works best."}
                waitForApproval
                onUploaded={(file) => void set(kind, file.assetId)}
              />
              {current ? (
                <Button type="button" variant="secondary" onClick={() => void set(kind, null)}>
                  Remove {kind}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
