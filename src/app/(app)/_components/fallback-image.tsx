"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * An image served through a short-lived signed storage URL. If it cannot be loaded (storage
 * unreachable, link expired, file removed), the fallback (usually initials) is shown instead of a
 * broken-image icon. The image is in the server-rendered HTML, so it can fail before React attaches
 * `onError`; the mount check below catches that case.
 */
export function FallbackImage({ src, className, alt = "", fallback }: { src: string; className: string; alt?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs cannot go through the image optimiser
  return <img ref={imageRef} src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
