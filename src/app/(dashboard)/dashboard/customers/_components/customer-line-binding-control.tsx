"use client";

import { useEffect, useState } from "react";
import { unlinkLineAccount } from "@/server/actions/reminder";

/** Compact, same-page LINE identity management for the customer drawer. */
export function CustomerLineBindingControl({
  customerId, status, onUpdated,
}: { customerId: string; status: string; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOpen(false); setConfirming(false); setError(null); }, [customerId]);

  async function unlink() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await unlinkLineAccount(customerId);
      if (!result.success) { setError(result.error); return; }
      setConfirming(false); setOpen(false); onUpdated();
    } catch {
      setError("解除失敗，請稍後重試");
    } finally { setBusy(false); }
  }

  const linked = status === "LINKED" || status === "BLOCKED";
  return <section aria-label="LINE 綁定管理" className="border-t border-earth-100 py-2 text-sm">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
      <span>LINE：{status === "LINKED" ? "已綁定" : status === "BLOCKED" ? "已封鎖" : "未綁定"}</span>
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setConfirming(false); setError(null); }} className="min-h-11 rounded px-3 text-primary-700">⋯ 管理</button>
    </div>
    {open && <div className="space-y-2 border-t border-earth-100 py-2">
      <p>重新綁定：請顧客使用本人的 LINE，於本店官方 LINE 輸入自己的手機號碼。已有其他會員綁定時，須先由店長核對身分。</p>
      {linked && !confirming && <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="min-h-11 rounded border border-earth-200 px-3 text-red-700">取消 LINE 綁定</button>}
      {confirming && <div className="space-y-2 rounded border border-earth-200 p-3">
        <p>解除後顧客暫時無法收到 LINE 通知。預約、方案及消費紀錄不會刪除。確認已核對本人身分？</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-11 rounded border px-3">返回</button>
          <button type="button" disabled={busy} onClick={() => void unlink()} className="min-h-11 rounded bg-red-700 px-3 text-white">{busy ? "處理中…" : "確認取消綁定"}</button>
        </div>
      </div>}
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
