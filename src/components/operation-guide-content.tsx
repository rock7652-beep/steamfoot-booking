"use client";

import { useContext, useId, useRef, useState } from "react";
import Image from "next/image";
import { availableGuides, findOperationGuides, guideCategories, relatedOperationGuides, type GuideContext } from "@/lib/operation-guide";
import { DashboardLink } from "./dashboard-link";
import { GuideAccessContext } from "./operation-guide-access";

export function OperationGuideContent({ full = false, context = "booking-list", bookingStatus, pathname = "/dashboard/bookings" }: { full?: boolean; context?: GuideContext; bookingStatus?: string; pathname?: string }) {
  const searchId = useId();
  const content = useRef<HTMLDivElement>(null);
  const scrollBody = useRef<HTMLDivElement>(null);
  function resetScroll() {
    const scroll = full ? null : scrollBody.current;
    if (scroll) scroll.scrollTo({ top: 0 });
    else content.current?.scrollIntoView?.({ block: "start" });
  }
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const access = useContext(GuideAccessContext);
  const guides = availableGuides(access);
  const article = guides.find((item) => item.id === articleId);
  const [section, setSection] = useState<"related" | "all">(full ? "all" : "related");
  const [category, setCategory] = useState<string | null>(null);
  const categories = guideCategories.filter(c => guides.some(g => g.category === c.id));
  const searching = query.trim().length > 0;
  const results = searching ? findOperationGuides(query, access) : section === "related" ? relatedOperationGuides(pathname, access) : guides.filter(g => g.category === category);
  if (!searching && context === "booking-detail" && (bookingStatus === "COMPLETED" || bookingStatus === "CANCELLED")) results.sort((a,b) => Number(b.id === "A03") - Number(a.id === "A03"));
  function selectSection(next: "related" | "all") {
    setSection(next); setCategory(null); setQuery(""); setArticleId(null); setExpanded(false); resetScroll();
  }

  return <div ref={content} className={full ? `w-full min-w-0 space-y-6${article ? " max-w-3xl" : ""}` : "flex h-full min-h-0 flex-col"}>
    <div data-guide-controls className={full ? "sticky top-14 z-10 space-y-2 border-b border-earth-200 bg-earth-50 py-3" : "shrink-0 space-y-2 border-b border-earth-200 bg-earth-50 px-4 py-2"}>
      {article ? <button type="button" onClick={() => { setArticleId(null); setExpanded(false); resetScroll(); }} className="min-h-11 text-sm font-semibold text-primary-800">← 返回問題列表</button> : <>
        <label className="sr-only" htmlFor={searchId}>搜尋操作問題</label>
        <input id={searchId} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setArticleId(null); setExpanded(false); resetScroll(); }} placeholder="搜尋問題：改時間、到期日…" className="min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 text-base" />
        <nav aria-label="教學範圍" className="grid grid-cols-2 gap-1 rounded-lg bg-earth-100 p-1">
          {([ ["related", "本頁相關"], ["all", "全部分類"] ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={!searching && section === value} onClick={() => selectSection(value)} className={`min-h-11 rounded-md text-sm font-semibold ${!searching && section === value ? "bg-white text-primary-900 shadow-sm" : "text-earth-600"}`}>{label}</button>)}
        </nav>
        {!searching && section === "all" && category && <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-sm">
          <button type="button" onClick={() => { setCategory(null); resetScroll(); }} className="min-h-11 font-semibold text-primary-800">← 全部分類</button>
          <span className="text-earth-600">{guideCategories.find(c => c.id === category)?.label}</span>
        </div>}
      </>}
    </div>
    <div ref={scrollBody} data-guide-scroll={full ? undefined : ""} className={full ? "space-y-5" : "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] touch-pan-y"} style={full ? undefined : { WebkitOverflowScrolling: "touch" }}>
    {article ? <>
      <h2 className="text-xl font-semibold text-primary-900">{article.title}</h2>
      <p className="rounded-lg border border-gold-200 bg-white p-3 text-sm leading-relaxed">操作位置：{article.path}</p>
      <ol className="list-decimal space-y-4 pl-6 text-base leading-relaxed">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-sm leading-relaxed"><p className="mb-1 font-semibold text-primary-900">操作前留意</p>{article.important}</div>
      <p className="rounded-lg bg-primary-50 p-3 text-sm leading-relaxed">完成確認：{article.success}</p>
      {(article.details.length > 0 || article.id === "A01") && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 font-semibold text-primary-800 underline underline-offset-4">{expanded ? "收起詳細說明" : "查看詳細說明"}</button>}
      {expanded && <>
        <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">{article.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
        {article.id === "A01" && <figure className="space-y-3">
          <figcaption className="font-semibold text-primary-900">實際操作畫面：先選日期與時段，再確認</figcaption>
          <a href="/operation-guide/reschedule.jpg" target="_blank" rel="noreferrer" className="block rounded-lg border border-earth-200 bg-white focus-visible:outline-2 focus-visible:outline-primary-700" aria-label="放大改期操作截圖（另開分頁）">
            <div className="relative overflow-hidden rounded-lg">
              <Image src="/operation-guide/reschedule.jpg" alt="Staging 測試店的改期預約視窗，含日期、可用時段及確認按鈕" width={1363} height={936} className="h-auto w-full" />
              <span aria-hidden="true" className="absolute left-[35%] top-[40%] flex h-6 w-6 items-center justify-center rounded-full bg-primary-900 text-xs font-bold text-white ring-2 ring-white">1</span>
              <span aria-hidden="true" className="absolute left-[35%] top-[49%] flex h-6 w-6 items-center justify-center rounded-full bg-primary-900 text-xs font-bold text-white ring-2 ring-white">2</span>
              <span aria-hidden="true" className="absolute left-[64%] top-[65%] flex h-6 w-6 items-center justify-center rounded-full bg-primary-900 text-xs font-bold text-white ring-2 ring-white">3</span>
            </div>
          </a>
          <p className="text-sm leading-relaxed text-earth-600">① 日期　② 時段　③ 確認。點圖片可放大查看；畫面使用測試資料。</p>
        </figure>}
      </>}
    </> : <>
      {!searching && section === "all" && !category ? <>
        <h2 className="text-base font-semibold text-primary-900">選擇問題分類</h2>
        <div className={full ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3" : "grid grid-cols-2 gap-2"}>
          {categories.map(c => <button key={c.id} type="button" onClick={() => { setCategory(c.id); resetScroll(); }} className="min-h-16 rounded-xl border border-earth-200 bg-white p-3 text-left text-sm font-semibold text-primary-900">{c.label}<span className="mt-1 block text-xs font-normal text-earth-500">{guides.filter(g => g.category === c.id).length} 篇</span></button>)}
        </div>
      </> : (searching || section === "related") && <h2 className="text-base font-semibold text-primary-900">{searching ? `搜尋結果（${results.length}）` : section === "related" ? "本頁常見問題" : guideCategories.find(c => c.id === category)?.label ?? "相關教學"}</h2>}
      {!searching && context === "booking-detail" && section === "related" && (bookingStatus === "COMPLETED" || bookingStatus === "CANCELLED") && <p className="text-sm leading-relaxed text-earth-600">這筆預約已{bookingStatus === "COMPLETED" ? "完成" : "取消"}，不能直接改時間或再次取消；可先查看本次備註教學。</p>}
      <div className={full ? "grid gap-4 lg:grid-cols-3" : "space-y-2"}>{results.map((item) => <button key={item.id} type="button" onClick={() => { setArticleId(item.id); setExpanded(false); resetScroll(); }} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white px-3 py-3 text-left text-sm leading-relaxed font-medium text-primary-900 hover:border-gold-400"><span><span className="block">{item.title}</span>{searching && <span className="mt-1 block text-xs font-normal text-earth-600">{guideCategories.find(c => c.id === item.category)?.label}</span>}{full && <span className="mt-2 block text-sm font-normal leading-relaxed text-earth-600">{item.summary}</span>}</span><span aria-hidden="true">›</span></button>)}</div>
      {results.length === 0 && (searching || section === "related" || category) && <p role="status" className="text-sm leading-relaxed text-earth-600">{searching ? "沒有符合的教學，請縮短關鍵字，或從全部分類尋找。" : "本頁尚無適用教學，可用搜尋或全部分類找答案。"}</p>}
    </>}
    {!full && <DashboardLink href="/dashboard/guide" target="_blank" rel="noreferrer" className="block border-t border-gold-200 pt-4 text-sm font-semibold text-primary-800 underline underline-offset-4">查看全部教學（另開分頁）</DashboardLink>}
    </div>
  </div>;
}
