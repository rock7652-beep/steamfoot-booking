import Image from "next/image";

/** Product identity only; navigation remains owned by each portal. */
export function SteamButlerLogo({ className = "w-32", compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap" aria-label="蒸管家">
        <span className="relative block h-8 w-7 shrink-0 overflow-hidden mix-blend-multiply" aria-hidden="true">
          <Image src="/pricing/brand/steam-butler-logo.png" alt="" width={536} height={220} unoptimized
            className="absolute left-[-10px] top-[-13px] h-[55px] w-[134px] max-w-none" />
        </span>
        <span className="text-base font-bold tracking-wide text-[#0F3B2E]">蒸管家</span>
      </span>
    );
  }
  return (
    <Image
      src="/pricing/brand/steam-butler-logo.png"
      alt="蒸管家 Steam Butler"
      width={536}
      height={220}
      unoptimized
      loading="eager"
      className={`block h-auto max-w-full mix-blend-multiply ${className}`}
    />
  );
}
