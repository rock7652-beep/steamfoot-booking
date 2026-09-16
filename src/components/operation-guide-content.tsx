"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { bookingGuides, searchBookingGuides, type GuideContext } from "@/lib/operation-guide";

export function OperationGuideContent({ full = false, context = "booking-list", bookingStatus }: { full?: boolean; context?: GuideContext; bookingStatus?: string }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const article = bookingGuides.find((item) => item.id === articleId);
  const results = searchBookingGuides(query, bookingStatus);

  return <div className={full ? `w-full min-w-0 space-y-6${article ? " max-w-3xl" : ""}` : "space-y-5"}>
    <p className="text-sm text-earth-500">{full ? "時段預約 · 3 篇操作教學" : context === "booking-detail" ? "這筆預約的操作說明" : "預約管理的操作說明"}</p>
    {article ? <>
      <button type="button" onClick={() => { setArticleId(null); setExpanded(false); }} className="min-h-11 text-sm font-semibold text-primary-800">← 返回問題列表</button>
      <h2 className="text-xl font-semibold text-primary-900">{article.title}</h2>
      <p className="rounded-lg border border-gold-200 bg-white p-3 text-sm leading-relaxed">操作位置：{article.path}</p>
      <ol className="list-decimal space-y-4 pl-6 text-base leading-relaxed">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-sm leading-relaxed"><p className="mb-1 font-semibold text-primary-900">操作前留意</p>{article.important}</div>
      <p className="rounded-lg bg-primary-50 p-3 text-sm leading-relaxed">完成確認：{article.success}</p>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 font-semibold text-primary-800 underline underline-offset-4">{expanded ? "收起詳細說明" : "查看詳細說明"}</button>
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
      <h2 className="text-xl font-semibold text-primary-900">{full ? "你想處理什麼？" : "你現在想處理什麼？"}</h2>
      {!full && context === "booking-detail" && (bookingStatus === "COMPLETED" || bookingStatus === "CANCELLED") && <p className="text-sm leading-relaxed text-earth-600">這筆預約已{bookingStatus === "COMPLETED" ? "完成" : "取消"}，不能直接改時間或再次取消；可先查看本次備註教學。</p>}
      <label className="block text-sm font-medium" htmlFor={searchId}>搜尋操作指南</label>
      <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：改期、取消、備註" className="min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 text-base" />
      <div className={full ? "grid gap-4 lg:grid-cols-3" : "space-y-3"}>{results.map((item) => <button key={item.id} type="button" onClick={() => { setArticleId(item.id); setExpanded(false); }} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white p-4 text-left font-medium text-primary-900 hover:border-gold-400"><span><span className="block">{item.title}</span>{full && <span className="mt-2 block text-sm font-normal leading-relaxed text-earth-600">{item.summary}</span>}</span><span aria-hidden="true">›</span></button>)}</div>
      {results.length === 0 && <p role="status" className="text-sm text-earth-600">目前沒有符合的教學，可試試「改期」「取消」或「備註」。</p>}
    </>}
  </div>;
}
