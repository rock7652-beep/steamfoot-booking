"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCustomerBookingWindow } from "@/server/actions/shop";

interface Props {
  /** 目前 ShopConfig.bookableUntilDate（"YYYY-MM-DD"）；null = 未設定 */
  initialDate: string | null;
  /** 未設定時的預設可預約到日期（"YYYY-MM-DD"，今天 +14 天） */
  initialOpensAt: string | null;
  initialDays: number;
  canManage: boolean;
}

export function BookableUntilForm({ initialDate, initialOpensAt, initialDays, canManage }: Props) {
  const localInitial = initialOpensAt
    ? new Date(new Date(initialOpensAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
    : "";
  const [opensAt, setOpensAt] = useState(localInitial);
  const [openMode, setOpenMode] = useState<"now" | "scheduled">(
    initialOpensAt ? "scheduled" : "now",
  );
  const [days, setDays] = useState(initialDays);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      if (openMode === "scheduled" && !opensAt) {
        toast.error("請選擇要開始開放的日期與時間");
        return;
      }
      const opensAtIso = openMode === "scheduled"
        ? new Date(`${opensAt}:00+08:00`).toISOString()
        : null;
      const result = await updateCustomerBookingWindow({ opensAt: opensAtIso, days });
      if (result.success) {
        toast.success(`已設定顧客可預約未來 ${days} 天`);
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    });
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white px-5 py-4 shadow-sm">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-earth-900">顧客預約開放範圍</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-earth-500">
          選擇何時讓顧客開始預約，再決定一次可看到未來幾天。後台代客預約不受影響。
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="text-xs text-earth-600">
          <legend className="mb-1">何時讓顧客開始預約？</legend>
          <div className="space-y-2 rounded-lg border border-earth-300 bg-white px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-earth-800">
              <input
                type="radio"
                name="booking-open-mode"
                checked={openMode === "now"}
                disabled={!canManage || pending}
                onChange={() => setOpenMode("now")}
              />
              現在立即開放
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-earth-800">
              <input
                type="radio"
                name="booking-open-mode"
                checked={openMode === "scheduled"}
                disabled={!canManage || pending}
                onChange={() => setOpenMode("scheduled")}
              />
              指定日期時間開放
            </label>
            {openMode === "scheduled" && (
              <input
                type="datetime-local"
                aria-label="開始開放日期與時間"
                value={opensAt}
                disabled={!canManage || pending}
                onChange={(e) => setOpensAt(e.target.value)}
                className="w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 disabled:opacity-60"
              />
            )}
          </div>
        </fieldset>
        <label className="text-xs text-earth-600">
          開放未來幾天（每24小時計算）
          <select value={days} disabled={!canManage || pending} onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 disabled:opacity-60">
            {[7, 14, 21, 30, 60, 90].map((value) => <option key={value} value={value}>{value} 天</option>)}
          </select>
        </label>
      </div>
        {canManage && (
          <div className="mt-3">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "儲存中..." : "儲存"}
            </button>
          </div>
        )}

      <p className="mt-2 text-[11px] text-earth-500">
        目前生效：
        <span className="font-semibold text-earth-800">
          {initialDate
            ? `既有設定開放至 ${initialDate}；儲存後將改為新版滾動範圍`
            : `${initialOpensAt ? "依指定時間自動開放，" : "立即開放，"}未來 ${initialDays} 天（每24小時計算）`}
        </span>
      </p>
    </section>
  );
}
