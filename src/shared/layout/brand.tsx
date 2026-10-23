import Image from "next/image";
import Link from "next/link";

const TIET_LOGO = "/brand/tiet-logo.png";

/**
 * The TIET logo provided by the owner (project-docs/TIET-Logo.png, copied unchanged).
 * The sidebar shows only the "ti" mark by cropping the display with CSS; the file is not modified.
 * Mark bounds in the 200x200 source: x 56..140, y 12..125 (measured, see phase report).
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span className={`relative block h-9 w-7 shrink-0 overflow-hidden ${className}`}>
      <Image
        src={TIET_LOGO}
        alt="TIET logo"
        width={62}
        height={62}
        className="absolute max-w-none"
        style={{ left: -17, top: -3 }}
        priority
      />
    </span>
  );
}

export function FullLogo({ size = 120 }: { size?: number }) {
  return <Image src={TIET_LOGO} alt="Thapar Institute of Engineering and Technology logo" width={size} height={size} priority />;
}

export function UnofficialNote({ className = "" }: { className?: string }) {
  return <p className={`text-xs text-muted ${className}`}>Unofficial student project</p>;
}

export function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-base font-semibold text-ink">Thapar SNS</span>
        <UnofficialNote />
      </span>
    </Link>
  );
}
