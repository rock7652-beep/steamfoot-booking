import Image from "next/image";
import Link from "next/link";

export function MarketingBrand() {
  return (
    <Link href="/" aria-label="蒸管家首頁" className="inline-flex shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#967039]">
      <span className="relative block h-[46px] w-[152px] overflow-hidden sm:h-[60px] sm:w-[200px]">
      <Image
        src="/pricing/brand/steam-butler-logo.png"
        alt="蒸管家 Steam Butler"
        width={1920}
        height={819}
        unoptimized
        loading="eager"
        className="absolute left-[-10.5%] top-[-34%] h-auto w-[118%] max-w-none mix-blend-multiply"
      />
      </span>
    </Link>
  );
}
