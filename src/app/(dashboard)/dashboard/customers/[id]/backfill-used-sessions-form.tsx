"use client";

import { useState, useActionState } from "react";
import { backfillUsedSessions } from "@/server/actions/wallet";
import { toast } from "sonner";
import { todayLocalDateString } from "@/lib/date-utils";

interface Props {
  walletId: string;
  available: number;
  reserved: number;
  /** wallet.startDate 的台灣日期字串，作為補登日期下界 */
  startDateLocal: string;
}

export function BackfillUsedSessionsForm({
  walletId,
  available,
  reserved,
  startDateLocal,
}: Props) {
  const today = todayLocalDateString();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [occurredAt, setOccurredAt] = useState(today);

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const c = Number(formData.get("count"));
      const date = String(formData.get("occurredAt") ?? "");
      const reason = String(formData.get("reason") ?? "").trim();

      if (!Number.isInteger(c) || c <= 0) {
        return { error: "補登堂數需為正整數" };
      }
      if (c > available) {
        return { error: `本次補登 ${c} 堂，但僅剩 ${available} 堂可用` };
      }
      if (!date) return { error: "請選擇補登日期" };
      if (date > today) return { error: "補登日期不可晚於今天" };
      if (date < startDateLocal) {
        return { error: `補登日期不可早於方案開始日（${startDateLocal}）` };
      }
      if (!reason) return { error: "請填寫補登原因" };

      const result = await backfillUsedSessions({
        walletId,
        count: c,
        occurredAt: date,
        reason,
      });

      if (result.success) {
        toast.success(
          `已補登 ${result.data.backfilledCount} 堂，剩餘 ${result.data.remainingAfter} 堂`
        );
        setOpen(false);
        setCount(1);
        setOccurredAt(today);
        return { error: null };
      }
      toast.error(result.error ?? "補登失敗");
      return { error: result.error ?? "發生錯誤" };
    },
    { error: null }
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:border-amber-400 hover:bg-amber-100"
      >
        補登已使用堂數
      </button>
    );
  }

  const overLimit = count > available;
  const previewRemaining = Math.max(0, available - count);

  return (
    <form action={action} className="space-y-2 rounded border border-amber-200 bg-amber-50/40 p-3">
      <div className="text-[11px] font-medium text-amber-800">
        補登已使用堂數（紙本卡轉線上）
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-earth-500">補登堂數</label>
          <input
            name="count"
            type="number"
            min="1"
            max={available}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 w-20 rounded border border-earth-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-earth-500">補登日期</label>
          <input
            name="occurredAt"
            type="date"
            min={startDateLocal}
            max={today}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="mt-1 rounded border border-earth-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-earth-500">原因</label>
          <input
            name="reason"
            placeholder="例：紙本卡轉線上"
            maxLength={200}
            className="mt-1 w-full rounded border border-earth-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="rounded bg-white px-2 py-1.5 text-[11px] text-earth-600">
        <div>
          目前可用：<span className="font-medium tabular-nums">{available}</span> 堂
          ／ 已預約保留：<span className="font-medium tabular-nums">{reserved}</span> 堂
        </div>
        <div>
          本次補登：<span className="font-medium tabular-nums">{count}</span> 堂
          → 補登後可用：
          <span
            className={`font-medium tabular-nums ${
              overLimit ? "text-red-600" : "text-amber-700"
            }`}
          >
            {overLimit ? "—" : previewRemaining}
          </span>{" "}
          堂
        </div>
        <div className="mt-1 text-earth-400">
          此操作不影響預約、不產生營收 / 付款 / 教練業績紀錄。
        </div>
      </div>

      {state.error && (
        <div className="text-xs text-red-600">{state.error}</div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || overLimit}
          className="rounded bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {pending ? "補登中…" : "確認補登"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-earth-400 hover:text-earth-600"
        >
          取消
        </button>
      </div>
    </form>
  );
}
