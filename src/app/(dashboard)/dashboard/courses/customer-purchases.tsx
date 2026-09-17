"use client";

import { useState, useTransition } from "react";
import { loadCourseCustomerPurchases } from "@/server/actions/course-customer-history";
import { formatTWDateTime } from "@/lib/date-utils";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";

type Rows = Extract<Awaited<ReturnType<typeof loadCourseCustomerPurchases>>, { success: true }>['data'];
const statuses: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳發卡", REFUNDED: "已退款", VOIDED: "已作廢" };

export function CourseCustomerPurchases({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function load() {
    if (pending) return;
    setError("");
    start(async () => {
      try {
        const result = await loadCourseCustomerPurchases(customerId);
        if (result.success) setRows(result.data);
        else setError(result.error);
      } catch { setError("讀取失敗，請重試"); }
    });
  }
  return <details className="mt-5 border-t border-earth-200 pt-3" onToggle={event => { if (event.currentTarget.open && !rows && !pending && !error) load(); }}>
    <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary-800">購買、核帳與退款紀錄（最近 100 筆）</summary>
    {pending && <p role="status">讀取中…</p>}
    {error && <div role="alert" className="text-sm text-red-700">{error}<button type="button" className="ml-2 min-h-11 rounded border px-3" onClick={load}>重試</button></div>}
    {rows?.length === 0 && <p className="py-3 text-sm text-earth-500">此顧客尚無購買紀錄。共卡使用額度請查看方案。</p>}
    <ul className="max-h-80 divide-y overflow-y-auto overscroll-contain">{rows?.map(order => <li key={order.id} className="space-y-1 py-3 text-sm">
      <p className="font-medium">{order.name} · {statuses[order.status] ?? "狀態待確認"}</p>
      <p>{formatTWDateTime(new Date(order.createdAt))} · {order.points} {order.unit === "SESSION" ? "堂" : "點"}</p>
      <p>{order.confirmedAt ? "原實付" : "訂單金額"} NT$ {order.price.toLocaleString()}{order.confirmedAt && ` · 核帳 ${formatTWDateTime(new Date(order.confirmedAt))}`}</p>
      {order.note && <p>交易備註：{order.note}</p>}
      {order.voidReason && <p>作廢原因：{order.voidReason}</p>}
      {order.refunds.map(refund => <p key={refund.id}>{formatTWDateTime(new Date(refund.createdAt))} 登錄退款 NT$ {refund.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[refund.method]??"其他非現金"} · {refund.reason}</p>)}
    </li>)}</ul>
  </details>;
}
