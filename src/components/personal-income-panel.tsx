"use client";

import { useRef, useState } from "react";
import { summarizePersonalIncome } from "@/lib/course-personal-income";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { filterIncomeLines, pageIncomeLines, type PersonalIncomeLine } from "@/lib/personal-income-ui";

const money = (value: number | null) => value === null ? "待核對" : `NT$ ${value.toLocaleString("zh-TW")}`;

function period(line: PersonalIncomeLine) {
  const start = formatTWDateTime(new Date(line.date)).slice(5);
  if (!line.endsAt) return start;
  const end = toLocalDateStr(new Date(line.date)) === toLocalDateStr(new Date(line.endsAt))
    ? formatTWDateTime(new Date(line.endsAt)).slice(11)
    : formatTWDateTime(new Date(line.endsAt)).slice(5);
  return `${start} ～ ${end}`;
}

/** Receives only the server's authorized, whitelisted personal income rows. */
export function PersonalIncomePanel({ lines, feeLabel = "授課費" }: { lines: PersonalIncomeLine[]; feeLabel?: "授課費" | "服務費" }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);
  const totals = summarizePersonalIncome(lines);
  const visible = filterIncomeLines(lines, query);
  const pagination = pageIncomeLines(visible, page);
  const filtered = query.trim() !== "";
  const kinds = (["FEE", "PROFIT"] as const).filter(kind => lines.some(line => line.kind === kind));

  if (!lines.length) return <p role="status" className="rounded-xl border border-earth-200 bg-white p-4 text-sm">本月尚無本人的已確認收入項目。</p>;

  const choosePage = (value: number) => {
    setPage(value);
    listRef.current?.scrollIntoView({ block: "start" });
  };

  return <div className="space-y-3">
    <section aria-label="本月收入摘要" className="rounded-xl bg-primary-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-sm text-earth-600">本月應領</p><p className="break-words text-2xl font-bold tabular-nums text-primary-800">{money(totals.total)}</p></div>
    </section>

    {lines.length >= 10 ? <div className="space-y-2">
      <input aria-label="搜尋項目" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-base" placeholder="搜尋整月課程或服務名稱" />

    </div> : null}
    {filtered ? <p role="status" className="text-sm text-earth-600">篩選結果 {visible.length} 筆 · 小計 {money(summarizePersonalIncome(visible).total)}</p> : null}
    {!visible.length ? <p role="status" className="rounded-xl border border-earth-200 p-4 text-sm">沒有符合條件的項目，請調整搜尋。</p> : null}

    <div ref={listRef} className="scroll-mt-3 space-y-3">
    {pagination.pageCount > 1 ? <IncomePagination {...pagination} total={visible.length} onChange={choosePage} /> : null}
    {kinds.map(kind => {
      const group = pagination.lines.filter(line => line.kind === kind);
      const allInKind = visible.filter(line => line.kind === kind);
      if (!group.length) return null;
      return <section key={kind} className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <h2 className="text-sm font-semibold">{kind === "FEE" ? feeLabel : "店長利潤"}<span className="ml-2 text-xs font-normal text-earth-500">共 {allInKind.length} 筆</span></h2>
          {kinds.length > 1 ? <span className="break-words text-xs tabular-nums text-earth-600">{filtered ? "篩選小計" : "整月小計"} {money(summarizePersonalIncome(allInKind).total)}</span> : null}
        </div>
        {group.map((line, index) => {
          return <details key={`${pagination.page}:${query}:${line.date}:${line.label}:${index}`} className="group border-t border-earth-100">
            <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-2 gap-y-0.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate text-sm font-medium" title={line.label}>{line.label}</span>
              <span className="max-w-[10rem] break-words text-right text-sm font-semibold tabular-nums">{money(line.amount)}<span aria-hidden="true" className="ml-1 font-normal text-earth-500"><span className="group-open:hidden">＋</span><span className="hidden group-open:inline">−</span></span></span>
              <span className="min-w-0 break-words text-xs text-earth-600">{period(line)}</span>
            </summary>
            <div className="space-y-2 bg-earth-50 px-4 pb-3 pt-2 text-sm">
              <p className="break-words font-medium">{line.label}</p>
              <p className="break-words text-xs text-earth-600">{formatTWDateTime(new Date(line.date))}{line.endsAt ? ` ～ ${formatTWDateTime(new Date(line.endsAt))}` : ""}</p>
            </div>
          </details>;
        })}
      </section>;
    })}
    {pagination.pageCount > 1 ? <IncomePagination {...pagination} total={visible.length} onChange={choosePage} /> : null}
    </div>
  </div>;
}

function IncomePagination({ page, pageCount, start, end, total, onChange }: { page: number; pageCount: number; start: number; end: number; total: number; onChange: (value: number) => void }) {
  return <nav aria-label="收入明細分頁" className="flex flex-wrap items-center justify-between gap-2 text-xs text-earth-600">
    <p role="status">第 {start}–{end} 筆／共 {total} 筆</p>
    <div className="flex items-center gap-2">
      <button type="button" aria-label="上一頁明細" disabled={page === 1} onClick={() => onChange(page - 1)} className="min-h-11 min-w-11 rounded-lg border border-earth-200 bg-white disabled:opacity-40">‹</button>
      <label className="flex items-center gap-1">頁碼<select aria-label="明細頁碼" value={page} onChange={event => onChange(Number(event.target.value))} className="min-h-11 rounded-lg border border-earth-200 bg-white px-2 text-base">{Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}／{pageCount}</option>)}</select></label>
      <button type="button" aria-label="下一頁明細" disabled={page === pageCount} onClick={() => onChange(page + 1)} className="min-h-11 min-w-11 rounded-lg border border-earth-200 bg-white disabled:opacity-40">›</button>
    </div>
  </nav>;
}
