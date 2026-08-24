"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTaiwanDuration, formatDateZh } from "@/lib/date-utils";
import {
  updateBookableUntilDate,
  updateCustomerBookingWindow,
} from "@/server/actions/shop";

interface Props {
  /** 目前 ShopConfig.bookableUntilDate（"YYYY-MM-DD"）；null = 未設定 */
  initialDate: string | null;
  initialDays: number;
  today: string;
  canManage: boolean;
}

export function BookableUntilForm({
  initialDate,
  initialDays,
  today,
  canManage,
}: Props) {
  const initialMode = initialDate ? "fixed" : "rolling";
  const [mode, setMode] = useState<"fixed" | "rolling">(initialMode);
  const [fixedDate, setFixedDate] = useState(initialDate ?? "");
  const [days, setDays] = useState(initialDays);
  const [savedMode, setSavedMode] = useState<"fixed" | "rolling">(initialMode);
  const [savedDate, setSavedDate] = useState(initialDate);
  const [savedDays, setSavedDays] = useState(initialDays);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      if (mode === "fixed" && !fixedDate) {
        toast.error("請選擇開放預約的截止日期");
        return;
      }
      const result =
        mode === "fixed"
          ? await updateBookableUntilDate({ date: fixedDate })
          : await updateCustomerBookingWindow({ opensAt: null, days });
      if (result.success) {
        setSavedMode(mode);
        setSavedDate(mode === "fixed" ? fixedDate : null);
        setSavedDays(days);
        toast.success(
          mode === "fixed"
            ? `已開放預約至 ${formatDateZh(fixedDate)}`
            : `已設定自動開放未來 ${days} 天`,
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    });
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white px-5 py-4 shadow-sm">
      <header className="mb-2">
        <h2 className="text-sm font-semibold text-earth-900">
          顧客預約開放範圍
        </h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-earth-500">
          直接設定顧客最遠可以預約到哪一天。後台代客預約不受影響。
        </p>
      </header>

      <fieldset className="space-y-2 text-xs text-earth-600">
        <legend className="mb-1">顧客可以預約到何時？</legend>
        <label
          className={`block cursor-pointer rounded-lg border px-3 py-3 ${mode === "fixed" ? "border-primary-400 bg-primary-50" : "border-earth-300 bg-white"}`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-earth-800">
            <input
              type="radio"
              name="booking-range-mode"
              checked={mode === "fixed"}
              disabled={!canManage || pending}
              onChange={() => setMode("fixed")}
            />
            開放至指定日期
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700">
              直覺設定
            </span>
          </span>
          {mode === "fixed" && (
            <input
              type="date"
              aria-label="開放預約截止日期"
              min={today}
              value={fixedDate}
              disabled={!canManage || pending}
              onChange={(event) => setFixedDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 disabled:opacity-60 sm:max-w-sm"
            />
          )}
          <span className="mt-1 block text-[11px] leading-relaxed text-earth-500">
            適合排好當月班表後，直接選擇月底或指定日期。
          </span>
        </label>

        <label
          className={`block cursor-pointer rounded-lg border px-3 py-3 ${mode === "rolling" ? "border-primary-400 bg-primary-50" : "border-earth-300 bg-white"}`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-earth-800">
            <input
              type="radio"
              name="booking-range-mode"
              checked={mode === "rolling"}
              disabled={!canManage || pending}
              onChange={() => setMode("rolling")}
            />
            自動開放未來幾天
          </span>
          {mode === "rolling" && (
            <select
              aria-label="自動開放天數"
              value={days}
              disabled={!canManage || pending}
              onChange={(event) => setDays(Number(event.target.value))}
              className="mt-2 w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 disabled:opacity-60 sm:max-w-sm"
            >
              {[7, 14, 21, 30, 60, 90].map((value) => (
                <option key={value} value={value}>
                  {value} 天
                </option>
              ))}
            </select>
          )}
          <span className="mt-1 block text-[11px] leading-relaxed text-earth-500">
            範圍會每天自動往後延伸，不需要店長重新設定。
          </span>
        </label>
      </fieldset>
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
        目前開放預約至：
        <span className="font-semibold text-earth-800">
          {` ${formatDateZh(
            savedMode === "fixed" && savedDate
              ? savedDate
              : addTaiwanDuration(today, savedDays, "DAY"),
          )}`}
        </span>
        {savedMode === "rolling" && `（未來 ${savedDays} 天，自動延長）`}
      </p>
    </section>
  );
}
