"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import Image from "next/image";
import { FrontendAccountMenu } from "@/components/frontend-account-menu";

export function LiffBrandHeader({ home, storeSlug, name, readOnly = false }: { home?: boolean; storeSlug?: string; name?: string; readOnly?: boolean } = {}) {
  const segment = useSelectedLayoutSegment();
  // Route segments also identify the homepage after store-prefixed rewrites.
  if ((home ?? segment === null) || segment === "public-trial") return null;
  return (
    <div className="mx-auto flex w-full max-w-md shrink-0 items-center justify-between gap-3 px-5 pt-[max(12px,env(safe-area-inset-top))]">
      <Image src="/pricing/brand/steam-butler-logo.png" alt="蒸管家"
        width={1920} height={819} unoptimized loading="eager"
        className="block h-auto w-28 max-w-full mix-blend-multiply" />
      {storeSlug && <FrontendAccountMenu storeSlug={storeSlug} name={name} readOnly={readOnly} />}
    </div>
  );
}
