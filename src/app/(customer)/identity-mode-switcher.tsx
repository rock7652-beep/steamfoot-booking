"use client";

import { AppLink as Link } from "@/components/app-link";

export function IdentityModeSwitcher({ storeSlug }: { storeSlug: string }) {
  return (
    <nav
      aria-label="身分切換"
      className="mb-4 grid grid-cols-2 rounded-2xl bg-earth-100 p-1 text-sm font-semibold"
    >
      <span className="rounded-xl bg-white px-4 py-3 text-center text-earth-900 shadow-sm">
        會員專區
      </span>
      <Link
        href={`/s/${storeSlug}/liff/spa-work`}
        onClick={() =>
          localStorage.setItem(`spa-member-mode:${storeSlug}`, "work")
        }
        className="rounded-xl px-4 py-3 text-center text-earth-600"
      >
        我的工作
      </Link>
    </nav>
  );
}
