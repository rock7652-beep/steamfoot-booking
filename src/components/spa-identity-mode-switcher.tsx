"use client";

import { AppLink as Link } from "@/components/app-link";

export function SpaIdentityModeSwitcher({
  storeSlug,
  activeMode,
}: {
  storeSlug: string;
  activeMode: "member" | "work";
}) {
  const memberActive = activeMode === "member";

  return (
    <nav
      aria-label="身分切換"
      className="grid grid-cols-2 rounded-2xl bg-earth-100 p-1 text-sm font-semibold"
    >
      <Link
        href={`/s/${storeSlug}/book`}
        aria-current={memberActive ? "page" : undefined}
        onClick={() =>
          localStorage.setItem(`spa-member-mode:${storeSlug}`, "member")
        }
        className={`rounded-xl px-4 py-3 text-center transition ${
          memberActive
            ? "bg-white text-earth-900 shadow-sm"
            : "text-earth-600"
        }`}
      >
        會員專區
      </Link>
      <Link
        href={`/s/${storeSlug}/liff/spa-work`}
        aria-current={memberActive ? undefined : "page"}
        onClick={() =>
          localStorage.setItem(`spa-member-mode:${storeSlug}`, "work")
        }
        className={`rounded-xl px-4 py-3 text-center transition ${
          memberActive
            ? "text-earth-600"
            : "bg-white text-earth-900 shadow-sm"
        }`}
      >
        我的工作
      </Link>
    </nav>
  );
}
