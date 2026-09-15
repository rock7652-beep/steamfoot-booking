import Image from "next/image";

/** Use the approved originals without redrawing the mark or typesetting the wordmark. */
export function SteamButlerLogo({ className = "w-32", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Image
      src={compact ? "/pricing/brand/steam-butler-mark.png" : "/pricing/brand/steam-butler-logo.png"}
      alt="蒸管家"
      width={compact ? 1254 : 1920}
      height={compact ? 1254 : 819}
      unoptimized
      loading="eager"
      className={compact ? "block h-10 w-10 shrink-0 object-contain mix-blend-multiply" : `block h-auto max-w-full mix-blend-multiply ${className}`}
    />
  );
}
