"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MarketingBrand } from "./marketing-brand";

export const marketingLinks = [
  { id: "features", href: "/pricing/features", label: "功能介紹" },
  { id: "pricing", href: "/pricing", label: "方案價格" },
  { id: "cases", href: "/cases", label: "店家案例" },
  { id: "guides", href: "/guides", label: "經營指南" },
] as const;

export function MarketingNavigation({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = marketingLinks.map(item => <Link key={item.id} href={item.href}
    aria-current={active === item.id ? "page" : undefined}
    onClick={() => setOpen(false)}
    className={"flex min-h-12 items-center rounded-lg px-4 text-base transition-colors hover:bg-[#E9F1EB] focus-visible:outline-2 focus-visible:outline-offset-2 " + (active === item.id ? "bg-[#E9F1EB] font-semibold text-[#123E32]" : "text-[#4C6259]")}>{item.label}</Link>);
  return <header className="sticky top-0 z-40 border-b border-[#153B31]/15 bg-[#F8F5EE] text-[#153B31]"
    onKeyDown={event => { if (event.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-2 px-4 sm:px-8">
      <div onClick={() => setOpen(false)} className="[&_img]:w-[120px] sm:[&_img]:w-[160px]"><MarketingBrand /></div>
      <nav aria-label="主要導覽" className="hidden items-center gap-1 lg:flex">{links}</nav>
      <div className="flex shrink-0 items-center gap-2">
        <a href="/apply?intent=trial&utm_source=website&utm_medium=organic&utm_campaign=trial-interest&utm_content=navigation" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#123E32] px-4 text-sm font-semibold text-white hover:bg-[#245A49] focus-visible:outline-2 focus-visible:outline-offset-4">申請體驗</a>
        <button ref={toggle} type="button" aria-expanded={open} aria-controls="mobile-marketing-menu" aria-label={open ? "關閉選單" : "開啟選單"} onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#153B31]/20 lg:hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
        </button>
      </div>
    </div>
    <nav id="mobile-marketing-menu" aria-label="手機主要導覽" hidden={!open} className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-[#153B31]/15 bg-[#F8F5EE] px-4 py-3 shadow-lg lg:hidden">{links}</nav>
  </header>;
}
