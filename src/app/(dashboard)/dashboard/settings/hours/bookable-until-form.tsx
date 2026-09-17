"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCourseBookingWindow } from "@/server/actions/course-booking-window";
import { addTaiwanDuration, formatDateZh } from "@/lib/date-utils";
import {
  updateBookableUntilDate,
  updateCustomerBookingWindow,
} from "@/server/actions/shop";

interface Props {
  course?: boolean;
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
  course = false,
}: Props) {
  const initialMode = initialDate ? "fixed" : "rolling";
  const [mode, setMode] = useState<"fixed" | "rolling">(initialMode);
  const [fixedDate, setFixedDate] = useState(initialDate ?? "");
  const [days, setDays] = useState(initialDays);
  const [savedMode, setSavedMode] = useState<"fixed" | "rolling">(initialMode);
  const [savedDate, setSavedDate] = useState(initialDate);
  const [savedDays, setSavedDays] = useState(initialDays);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = mode !== savedMode || (mode === "fixed" ? fixedDate !== savedDate : days !== savedDays);

  function cancel() {
    setMode(savedMode);
    setFixedDate(savedDate ?? "");
    setDays(savedDays);
    setExpanded(false);
  }

  function save() {
    startTransition(async () => {
      if (mode === "fixed" && !fixedDate) {
        toast.error("請選擇開放預約的截止日期");
        return;
      }
      const result = course ? await saveCourseBookingWindow(mode === "fixed" ? {mode,date:fixedDate} : {mode,days}) :
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
        setExpanded(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "儲存失敗");
      }
    });
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white px-5 py-4 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-earth-900">預約開放期限</h2>
          <p className="mt-0.5 text-[11px] text-earth-500">
            目前生效：{savedMode === "fixed" && savedDate
              ? `開放至 ${formatDateZh(savedDate)}`
              : `自動開放未來 ${savedDays} 天`}
          </p>
        </div>
        {canManage && (
          <button type="button" disabled={pending} onClick={() => expanded ? cancel() : setExpanded(true)} className="shrink-0 rounded border border-earth-300 px-2.5 py-1 text-xs font-medium text-earth-700 hover:bg-earth-50">
            {expanded ? "取消" : "修改"}
          </button>
        )}
      </header>

      {expanded && dirty && <p role="status" className="mt-3 text-xs font-medium text-amber-700">尚未儲存</p>}
      {expanded && <fieldset className="mt-3 space-y-2 text-xs text-earth-600">
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
            適合每月排班。
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
            每天自動延長。
          </span>
        </label>
      </fieldset>}
      {canManage && expanded && (
        <div className="mt-3">
          <button
            type="button"
            disabled={pending || !dirty || (mode === "fixed" && !fixedDate)}
            onClick={save}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "儲存中..." : "確認儲存"}
          </button>
        </div>
      )}

      {expanded && <p className="mt-2 text-[11px] text-earth-500">
        目前生效至：
        <span className="font-semibold text-earth-800">{` ${formatDateZh(savedMode === "fixed" && savedDate ? savedDate : addTaiwanDuration(today, savedDays, "DAY"))}`}</span>
        {savedMode === "rolling" && `（未來 ${savedDays} 天，自動延長）`}
      </p>}
    </section>
  );
}
