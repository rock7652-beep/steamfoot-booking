"use client";

import { useState } from "react";
import { summarizePersonalIncome } from "@/lib/course-personal-income";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { filterIncomeLines, incomePaymentStatus, type IncomeFilter, type PersonalIncomeLine } from "@/lib/personal-income-ui";

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
  const [filter, setFilter] = useState<IncomeFilter>("all");
  const [query, setQuery] = useState("");
  const totals = summarizePersonalIncome(lines);
  const visible = filterIncomeLines(lines, filter, query);
  const filtered = filter !== "all" || query.trim() !== "";
  const kinds = (["FEE", "PROFIT"] as const).filter(kind => lines.some(line => line.kind === kind));

  if (!lines.length) return <p role="status" className="rounded-xl border border-earth-200 bg-white p-4 text-sm">本月尚無本人的已確認收入項目。</p>;

  return <div className="space-y-4">
    <section aria-label="本月收入摘要" className="rounded-2xl bg-primary-50 p-4">
      <p className="text-sm text-earth-600">本月應領</p>
      <p className="mt-1 break-words text-3xl font-bold tabular-nums text-primary-800">{money(totals.total)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary-100 pt-3">
        <div className="min-w-0"><p className="text-xs text-earth-600">已登記付款</p><p className="mt-1 break-words font-semibold tabular-nums">{money(totals.paid)}</p></div>
        <div className="min-w-0"><p className="text-xs text-earth-600">未付</p><p className="mt-1 break-words font-semibold tabular-nums">{money(totals.remaining)}</p></div>
      </div>
      {totals.overpaid !== null && totals.overpaid > 0 ? <p role="status" className="mt-3 text-sm text-amber-800">溢付 {money(totals.overpaid)}，請洽店長核對。</p> : null}
      <p className="mt-3 text-xs text-earth-600">付款為店家登記紀錄，請以實際入帳為準。</p>
    </section>

    {lines.length >= 10 ? <div className="space-y-2">
      <label className="block text-sm text-earth-600">搜尋項目<input type="search" value={query} onChange={event => setQuery(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-base" placeholder="輸入課程或服務名稱" /></label>
      <div className="flex flex-wrap gap-2" aria-label="付款狀態篩選">{([ ["all", "全部"], ["unpaid", "未付"], ["paid", "已付清"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg border px-4 text-sm ${filter === value ? "border-primary-700 bg-primary-700 text-white" : "border-earth-200 bg-white text-earth-700"}`}>{label}</button>)}</div>
    </div> : null}
    {filtered ? <p role="status" className="text-sm text-earth-600">篩選結果 {visible.length} 筆 · 小計 {money(summarizePersonalIncome(visible).total)}</p> : null}
    {!visible.length ? <p role="status" className="rounded-xl border border-earth-200 p-4 text-sm">沒有符合條件的項目，請調整篩選或搜尋。</p> : null}

    {kinds.map(kind => {
      const group = visible.filter(line => line.kind === kind);
      if (!group.length) return null;
      return <section key={kind} className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="font-semibold">{kind === "FEE" ? feeLabel : "店長利潤"}<span className="ml-2 text-sm font-normal text-earth-500">{group.length} 筆</span></h2>
          {kinds.length > 1 ? <span className="break-words text-sm tabular-nums text-earth-600">{money(summarizePersonalIncome(group).total)}</span> : null}
        </div>
        {group.map((line, index) => {
          const status = incomePaymentStatus(line);
          const tone = status === "已付清" || status === "無應付金額" ? "bg-primary-50 text-primary-800" : "bg-amber-50 text-amber-800";
          return <details key={`${line.date}:${line.label}:${index}`} className="group border-t border-earth-100">
            <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,auto)] gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="col-span-2 text-xs text-earth-600">{period(line)}</span>
              <span className="min-w-0 break-words text-sm font-medium">{line.label}</span>
              <span className="max-w-[10rem] break-words text-right text-sm font-semibold tabular-nums">{money(line.amount)}</span>
              <span className="col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1"><span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{status}</span><span className="text-xs text-earth-500"><span className="group-open:hidden">查看明細 ＋</span><span className="hidden group-open:inline">收合明細 −</span></span></span>
            </summary>
            <div className="space-y-2 bg-earth-50 px-4 pb-3 pt-2 text-sm">
              <p className="break-words text-xs text-earth-600">{formatTWDateTime(new Date(line.date))}{line.endsAt ? ` ～ ${formatTWDateTime(new Date(line.endsAt))}` : ""}</p>
              <p className="break-words">已登記付款 {money(line.paid)} · 未付 {money(summarizePersonalIncome([line]).remaining)}</p>
              {line.payments.length ? <div className="space-y-1"><p className="text-xs font-medium text-earth-600">付款紀錄</p>{line.payments.map((payment, paymentIndex) => <p key={paymentIndex} className="break-words text-xs text-earth-600">{formatTWDateTime(new Date(payment.date))} · {money(payment.amount)} · {payment.voided ? "已更正（不計入付款）" : "已登記"}</p>)}</div> : <p className="text-xs text-earth-600">尚無付款登記紀錄。</p>}
            </div>
          </details>;
        })}
      </section>;
    })}
  </div>;
}
