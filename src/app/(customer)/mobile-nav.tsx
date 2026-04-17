"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/server/actions/auth";
import { LogoutButton } from "@/components/logout-button";

// SVG icon paths (Heroicons outline, 24x24 viewBox) — 與桌面版 sidebar 共用同一套
const ICON_PATHS: Record<string, string[]> = {
  home: [
    "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12",
    "M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  ],
  plus: ["M12 4.5v15m7.5-7.5h-15"],
  calendar: [
    "M6.75 3v2.25M17.25 3v2.25",
    "M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  ],
  wallet: [
    "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z",
    "M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6",
  ],
  trophy: [
    "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172",
    "M5.25 4.236c-.996.178-1.768.621-2.134 1.1a1.097 1.097 0 00.058 1.37c.588.694 2.09.851 3.143.338m12.433-.738c.996.178 1.768.621 2.134 1.1a1.097 1.097 0 01-.058 1.37c-.588.694-2.09.851-3.143.338M12 2.25c2.386 0 4.5 2.015 4.5 4.5s-2.114 4.5-4.5 4.5-4.5-2.015-4.5-4.5 2.114-4.5 4.5-4.5z",
  ],
  user: [
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
    "M4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  ],
  external: [
    "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5",
    "M7.5 16.5L21 3m0 0h-5.25M21 3v5.25",
  ],
  logout: [
    "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15",
    "M18.75 12l3-3m0 0l-3-3m3 3H9",
  ],
};

function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.home;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const NAV_ITEMS_BASE = [
  { href: "/book", label: "首頁", icon: "home" },
  { href: "/book/new", label: "新增預約", icon: "plus" },
  { href: "/my-bookings", label: "我的預約", icon: "calendar" },
  { href: "/my-plans", label: "我的方案", icon: "wallet" },
  { href: "/profile", label: "我的資料", icon: "user" },
];

export function MobileNav({ userName, pathname, customerId, storeSlug = "zhubei" }: { userName: string; pathname: string; customerId?: string | null; storeSlug?: string }) {
  const prefix = `/s/${storeSlug}`;
  const NAV_ITEMS = NAV_ITEMS_BASE.map((item) => ({ ...item, fullHref: `${prefix}${item.href}` }));
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Header bar */}
      <header className="sticky top-0 z-40 border-b border-earth-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-earth-600 hover:bg-earth-100"
            aria-label="開啟選單"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href={`${prefix}/book`} className="text-base font-bold text-earth-900">
            蒸足健康站
          </Link>
          <span className="text-xs text-earth-500 max-w-[80px] truncate">{userName}</span>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in menu */}
      <nav
        className={`fixed inset-y-0 left-0 z-50 w-[260px] transform bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-earth-200 px-5 py-4">
          <div>
            <p className="text-base font-bold text-earth-900">蒸足健康站</p>
            <p className="mt-0.5 text-xs text-earth-400">{userName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-earth-400 hover:bg-earth-100"
            aria-label="關閉選單"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-3 py-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/book"
                ? pathname === "/book"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.fullHref}
                onClick={() => setOpen(false)}
                className={`mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-primary-50 font-medium text-primary-700"
                    : "text-earth-600 hover:bg-earth-50"
                }`}
              >
                <NavIcon name={item.icon} className={isActive ? "text-primary-600" : "text-earth-400"} />
                {item.label}
              </Link>
            );
          })}

          <a
            href={`https://www.healthflow-ai.com/liff${customerId ? `?customerId=${customerId}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-earth-600 hover:bg-earth-50 transition"
          >
            <NavIcon name="external" className="text-earth-400" />
            AI健康評估
          </a>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-earth-200 px-3 py-4">
          <form action={logoutAction}>
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <LogoutButton
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-earth-400 hover:bg-earth-50 hover:text-earth-600 transition"
              iconClassName="text-earth-300"
              iconSize={20}
            />
          </form>
        </div>
      </nav>
    </>
  );
}
