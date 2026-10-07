"use client";

import { AuditChanges } from "@/components/audit-changes";
import { auditRoleLabel, auditSummary } from "@/lib/audit-presentation";
import { useState } from "react";
import { loadOperationHistory, type OperationHistoryItem } from "@/server/actions/operation-audit";

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

export function OperationHistoryButton({
  targetType,
  targetId,
  className = "text-sm text-earth-500 underline underline-offset-2 hover:text-earth-800",
}: {
  targetType: "Booking" | "SpaBooking" | "CourseBooking" | "CashbookEntry" | "StaffPermission" | "InventoryOrder" | "InventoryProduct" | "InventorySupplier" | "InventoryPayment" | "InventoryStockCount";
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
                        <p className="text-sm font-medium text-earth-900">{auditSummary({...item,targetType})}</p>
                        <time className="text-sm tabular-nums text-earth-500">{formatTime(item.createdAt)}</time>
                      </div>
                      <p className="mt-1 text-sm text-earth-600">
                        {item.source === "SYSTEM" ? `系統自動（觸發：${item.actorNameSnapshot ?? item.actor.name}）` : item.actorNameSnapshot ?? item.actor.name}・{auditRoleLabel(item.actorRoleSnapshot ?? item.actor.role)}
                        {!item.actorRoleSnapshot ? "（目前身分；舊紀錄未保存當時身分）" : ""}
                        {index === 0 ? "（最後操作）" : ""}
                      </p>
                      <p className="mt-1 break-words text-sm text-earth-600">{item.targetLabel}</p>
                      <AuditChanges before={item.beforeJson} after={item.afterJson} references={item.references} />
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
