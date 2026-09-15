import Image from "next/image";

/** Preserve the approved mark and original wordmark in every portal. */
export function SteamButlerLogo({ className = "w-32", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`relative block aspect-[3.45/1] shrink-0 overflow-hidden ${compact ? "w-32" : className}`}>
      <Image
        src="/pricing/brand/steam-butler-logo.png"
        alt="蒸管家"
        width={1920}
        height={819}
        unoptimized
        loading="eager"
        className="absolute left-[-10.5%] top-[-34%] h-auto w-[118%] max-w-none mix-blend-multiply"
      />
    </span>
  );
}
