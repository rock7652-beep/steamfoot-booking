"use client";

import Link from "next/link";
import { useSelectedLayoutSegment, useSelectedLayoutSegments } from "next/navigation";

const icons = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  bookings: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  wallets: "M3 5h18v14H3ZM3 9h18M6 15h4",
  health: "M3 3v18h18M6 15l4-5 4 3 6-7",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
};

/** Segment matching remains stable across the store-prefixed proxy rewrite. */
export function LiffBottomNav({
  storeSlug,
  healthAssessmentEnabled,
  homeOnly = false,
}: {
  storeSlug: string;
  healthAssessmentEnabled: boolean;
  homeOnly?: boolean;
}) {
  const segment = useSelectedLayoutSegment();
  const segments = useSelectedLayoutSegments();
  if (segments.length > 1) return null;
  const sections = ["bookings", "wallets", "health", "profile"];
  // Booking forms retain their own fixed submit bar; onboarding and work are separate flows.
  if (homeOnly ? segment !== null : !segment || !sections.includes(segment)) return null;
  const base = `/s/${storeSlug}/liff`;
  const items: { key: keyof typeof icons; label: string; href: string }[] = [
    { key: "home", label: "首頁", href: base },
    { key: "bookings", label: "預約", href: `${base}/bookings` },
    { key: "wallets", label: "方案", href: `${base}/wallets` },
    ...(healthAssessmentEnabled ? [{ key: "health" as const, label: "健康", href: `${base}/health` }] : []),
    { key: "profile", label: "我的", href: `${base}/profile` },
  ];
  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0" />
      <nav aria-label="會員功能" className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md border-t border-earth-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        {items.map(({ key, label, href }) => {
          const active = key === "home" ? segment === null : segment === key;
          return (
            <Link key={key} href={href} prefetch={false} aria-current={active ? "page" : undefined}
              className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs focus-visible:outline-2 focus-visible:outline-primary-600 ${active ? "font-semibold text-primary-700" : "text-earth-500 hover:text-primary-700"}`}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={icons[key]} /></svg>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
