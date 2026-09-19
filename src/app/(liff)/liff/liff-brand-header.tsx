"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import Image from "next/image";

export function LiffBrandHeader() {
  const segment = useSelectedLayoutSegment();
  // Route segments also identify the homepage after store-prefixed rewrites.
  if (segment === null) return null;
  return (
    <div className="mx-auto flex w-full max-w-md shrink-0 justify-end px-5 pt-[max(12px,env(safe-area-inset-top))]">
      <Image src="/pricing/brand/steam-butler-logo.png" alt="蒸管家"
        width={1920} height={819} unoptimized loading="eager"
        className="block h-auto w-36 max-w-full mix-blend-multiply" />
    </div>
  );
}
