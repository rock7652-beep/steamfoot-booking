"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";

export function LiffBrandHeader() {
  const segment = useSelectedLayoutSegment();
  // Route segments also identify the homepage after store-prefixed rewrites.
  if (segment === null) return null;
  return <div className="mx-auto flex w-full max-w-md justify-end px-5 pt-3"><SteamButlerLogo compact /></div>;
}
