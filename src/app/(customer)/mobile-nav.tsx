"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/server/actions/auth";

const NAV_ITEMS = [
  { href: "/book", label: "首頁", icon: "🏠" },
  { href: "/book/new", label: "新增預約", icon: "📅" },
  { href: "/my-bookings", label: "我的預約", icon: "📋" },
  { href: "/my-plans", label: "我的方案", icon: "💎" },
  { href: "/profile", label: "我的資料", icon: "👤" },
];

export function MobileNav({ userName, pathname }: { userName: string; pathname: string }) {
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
          <Link href="/book" className="text-base font-bold text-earth-900">
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
                href={item.href}
                onClick={() => setOpen(false)}
                className={`mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-primary-50 font-medium text-primary-700"
                    : "text-earth-600 hover:bg-earth-50"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <a
            href="https://health-tracker-eight-rosy.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-earth-600 hover:bg-earth-50 transition"
          >
            <span className="text-base">📊</span>
            身體指數
            <span className="ml-auto text-xs text-earth-300">&#8599;</span>
          </a>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-earth-200 px-3 py-4">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-earth-400 hover:bg-earth-50 hover:text-earth-600 transition"
            >
              <span className="text-base">🚪</span>
              登出
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
