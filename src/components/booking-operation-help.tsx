"use client";

import { useId, useRef, useState } from "react";
import { bookingGuides, searchBookingGuides } from "@/lib/operation-guide";

/** Native dialog preserves the page tree, traps focus and restores trigger focus. */
export function BookingOperationHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [query, setQuery] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const article = bookingGuides.find((item) => item.id === articleId);

  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => {
      setQuery(""); setArticleId(null); setExpanded(false); dialog.current?.showModal();
    }} className="min-h-11 rounded-lg border border-gold-300 bg-white px-3 text-sm font-semibold text-primary-800 hover:bg-earth-50">
      ？操作說明
    </button>
    <dialog ref={dialog} aria-labelledby={heading}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-gold-200 bg-earth-50 p-0 text-earth-900 shadow-xl backdrop:bg-black/30 md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[440px] md:rounded-none"
      onClick={(event) => { if (event.target === dialog.current) {
        const rect = dialog.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current.close();
      } }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gold-300 bg-earth-50 px-5 py-3">
        <h2 id={heading} className="text-lg font-semibold text-primary-900">操作說明</h2>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary-800">關閉</button>
      </div>
      <div className="space-y-5 p-5 pb-8">
        <p className="text-xs text-earth-500">測試內容 · 時段預約 · 待實際操作驗收</p>
        {article ? <>
          <button type="button" onClick={() => { setArticleId(null); setExpanded(false); }} className="min-h-11 text-sm font-semibold text-primary-800">← 返回問題列表</button>
          <h3 className="text-xl font-semibold text-primary-900">{article.title}</h3>
          <p className="rounded-lg border border-gold-200 bg-white p-3 text-sm leading-relaxed">操作位置：{article.path}</p>
          <ol className="list-decimal space-y-4 pl-6 text-base leading-relaxed">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <p className="rounded-lg bg-primary-50 p-3 text-sm leading-relaxed">完成確認：{article.success}</p>
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-h-11 font-semibold text-primary-800 underline underline-offset-4">{expanded ? "收起完整說明" : "查看完整說明與注意事項"}</button>
          {expanded && <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed">{article.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        </> : <>
          <h3 className="text-xl font-semibold text-primary-900">你想處理什麼？</h3>
          <label className="block text-sm font-medium" htmlFor={`${heading}-search`}>搜尋操作指南</label>
          <input id={`${heading}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：改期、取消、備註" className="min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 text-base" />
          <div className="space-y-3">{searchBookingGuides(query).map((item) => <button key={item.id} type="button" onClick={() => { setArticleId(item.id); setExpanded(false); }} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-earth-200 bg-white p-4 text-left font-medium text-primary-900 hover:border-gold-400"><span>{item.title}</span><span aria-hidden="true">›</span></button>)}</div>
          {searchBookingGuides(query).length === 0 && <p role="status" className="text-sm text-earth-600">這批教學暫時找不到符合的內容，可試試「改期」「取消」或「備註」。</p>}
        </>}
      </div>
    </dialog>
  </>;
}
