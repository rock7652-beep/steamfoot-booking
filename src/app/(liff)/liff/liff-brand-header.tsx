"use client";

import { usePathname } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";

export function LiffBrandHeader() {
  const pathname = usePathname();
  // The member homepage owns its combined store and product header.
  if (pathname.replace(/\/$/, "") === "/liff") return null;
  return <div className="mx-auto flex w-full max-w-md justify-end px-5 pt-3"><SteamButlerLogo compact /></div>;
}
