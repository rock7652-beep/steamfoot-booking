"use client";

import { useState } from "react";
import { loadOperationHistory, type OperationHistoryItem } from "@/server/actions/operation-audit";

const roleLabels: Record<string, string> = {
  ADMIN: "總部",
  OWNER: "店長",
  STAFF: "人員",
  PARTNER: "人員",
  CUSTOMER: "顧客",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const fieldLabels: Record<string, string> = {
  notes: "備註",
  note: "備註",
  status: "狀態",
  entryDate: "日期",
  type: "收支類型",
  category: "分類",
  amount: "金額",
  paymentMethod: "付款方式",
  staffId: "歸屬人員",
  customerId: "顧客",
  checkedInAt: "簽到時間",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/phone|mobile/i.test(key)) return text.replace(/(\d{4})\d+(\d{3})/, "$1***$2");
  if (key === "amount" && Number.isFinite(Number(value))) return `NT$ ${Number(value).toLocaleString("zh-TW")}`;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function Changes({ before, after }: { before: unknown; after: unknown }) {
  const previous = asRecord(before);
  const next = asRecord(after);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  if (keys.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-700">
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[5rem_1fr] gap-2">
          <dt className="text-earth-500">{fieldLabels[key] ?? key}</dt>
          <dd className="min-w-0 break-words">
            {formatValue(key, previous[key])} <span aria-hidden="true">→</span> {formatValue(key, next[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function OperationHistoryButton({
  targetType,
  targetId,
  className = "text-xs text-earth-500 underline underline-offset-2 hover:text-earth-800",
}: {
  targetType: "Booking" | "SpaBooking" | "CourseBooking" | "CashbookEntry" | "StaffPermission";
  targetId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OperationHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function showHistory() {
    setOpen(true);
    if (items || loading) return;
    setLoading(true);
    const result = await loadOperationHistory({ targetType, targetId, limit: 20 });
    if (result.success) setItems(result.data);
    else setError(result.error ?? "無法讀取操作紀錄");
    setLoading(false);
  }

  return (
    <>
      <button type="button" className={className} onClick={(event) => { event.stopPropagation(); void showHistory(); }}>
        查看紀錄
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4" role="presentation" onClick={() => setOpen(false)}>
          <section className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby={`operation-history-${targetId}`} onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-earth-200 px-5 py-4">
              <h2 id={`operation-history-${targetId}`} className="text-base font-semibold text-earth-900">操作紀錄</h2>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-earth-500 hover:bg-earth-100" aria-label="關閉操作紀錄" onClick={() => setOpen(false)}>✕</button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              {loading && <p className="text-sm text-earth-500">讀取中…</p>}
              {error && <p className="text-sm text-red-700">{error}</p>}
              {items?.length === 0 && <p className="text-sm text-earth-500">這筆資料尚無操作紀錄；功能上線前的歷史資料不會補填操作人。</p>}
              {items && items.length > 0 && (
                <ol className="divide-y divide-earth-100">
                  {items.map((item, index) => (
                    <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-medium text-earth-900">{item.summary ?? item.action}</p>
                        <time className="text-xs tabular-nums text-earth-500">{formatTime(item.createdAt)}</time>
                      </div>
                      <p className="mt-1 text-xs text-earth-600">
                        {item.actorNameSnapshot ?? item.actor.name}・{roleLabels[item.actor.role] ?? item.actor.role}
                        {index === 0 ? "（最後操作）" : ""}
                      </p>
                      <Changes before={item.beforeJson} after={item.afterJson} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
