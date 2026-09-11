import Image from "next/image";
import Link from "next/link";

export function MarketingBrand() {
  return (
    <Link href="/" aria-label="蒸管家首頁" className="inline-flex shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#967039]">
      <Image
        src="/pricing/brand/steam-butler-logo.png"
        alt="蒸管家 Steam Butler"
        width={536}
        height={220}
        unoptimized
        loading="eager"
        className="h-auto w-[150px] mix-blend-multiply sm:w-[200px]"
      />
    </Link>
  );
}
