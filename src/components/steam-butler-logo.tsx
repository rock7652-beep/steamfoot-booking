import Image from "next/image";

/** Product identity only; navigation remains owned by each portal. */
export function SteamButlerLogo({ className = "w-32" }: { className?: string }) {
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
