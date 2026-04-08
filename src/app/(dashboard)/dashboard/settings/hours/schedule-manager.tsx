"use client";

import { useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
import {
  updateBusinessHours,
  addSpecialDay,
  removeSpecialDayByDate,
  getMonthSpecialDays,
  getDaySlotDetails,
  copySettingsToFutureWeeks,
} from "@/server/actions/business-hours";

// ============================================================
// Types
// ============================================================

interface WeeklyHour {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

interface SpecialDay {
  id: string;
  date: string;
  type: string;
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
}

interface DayDetail {
  status: "open" | "closed" | "training" | "custom";
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
  specialDayId: string | null;
  dayOfWeek: number;
  dayName: string;
  slots: { startTime: string; capacity: number; isEnabled: boolean; inRange: boolean }[];
  weeklyDefault: { isOpen: boolean; openTime: string | null; closeTime: string | null } | null;
}

interface Props {
  weeklyHours: WeeklyHour[];
  initialSpecialDays: SpecialDay[];
  initialYear: number;
  initialMonth: number;
  canManage: boolean;
}

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

// ============================================================
// Component
// ============================================================

export function ScheduleManager({
  weeklyHours: initialWeekly,
  initialSpecialDays,
  initialYear,
  initialMonth,
  canManage,
}: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>(initialSpecialDays);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [weeklyHours, setWeeklyHours] = useState(initialWeekly);
  const [isPending, startTransition] = useTransition();
  const [loadingDay, setLoadingDay] = useState(false);

  // 每週固定設定展開/收合
  const [showWeekly, setShowWeekly] = useState(false);

  // 日設定面板 - 編輯狀態
  const [editStatus, setEditStatus] = useState<"open" | "closed" | "training" | "custom">("open");
  const [editOpenTime, setEditOpenTime] = useState("10:00");
  const [editCloseTime, setEditCloseTime] = useState("22:00");
  const [editReason, setEditReason] = useState("");
  const [copyWeeks, setCopyWeeks] = useState(0);

  // ── 月曆資料計算 ──
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();
  const startDow = firstDay.getUTCDay();

  const specialMap = new Map(specialDays.map((s) => [s.date, s]));

  function getDayColor(dateStr: string, dow: number): string {
    const special = specialMap.get(dateStr);
    if (special) {
      if (special.type === "closed") return "bg-earth-200 text-earth-500";
      if (special.type === "training") return "bg-red-100 text-red-600";
      if (special.type === "custom") return "bg-blue-100 text-blue-700";
    }
    const weekly = weeklyHours.find((w) => w.dayOfWeek === dow);
    if (weekly && !weekly.isOpen) return "bg-earth-200 text-earth-500";
    return "bg-green-50 text-green-700";
  }

  function getDayLabel(dateStr: string, dow: number): string {
    const special = specialMap.get(dateStr);
    if (special) {
      if (special.type === "closed") return "休";
      if (special.type === "training") return "修";
      if (special.type === "custom") return "特";
    }
    const weekly = weeklyHours.find((w) => w.dayOfWeek === dow);
    if (weekly && !weekly.isOpen) return "休";
    return "";
  }

  // ── 換月 ──
  const changeMonth = useCallback(async (dir: 1 | -1) => {
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setYear(newYear);
    setMonth(newMonth);
    setSelectedDate(null);
    setDayDetail(null);

    // 載入新月份的特殊日期
    const data = await getMonthSpecialDays(newYear, newMonth);
    setSpecialDays(data);
  }, [year, month]);

  // ── 選擇日期 ──
  const selectDate = useCallback(async (dateStr: string) => {
    setSelectedDate(dateStr);
    setLoadingDay(true);
    try {
      const detail = await getDaySlotDetails(dateStr);
      setDayDetail(detail);
      setEditStatus(detail.status);
      setEditOpenTime(detail.openTime ?? "10:00");
      setEditCloseTime(detail.closeTime ?? "22:00");
      setEditReason(detail.reason ?? "");
      setCopyWeeks(0);
    } catch {
      toast.error("載入日期設定失敗");
    } finally {
      setLoadingDay(false);
    }
  }, []);

  // ── 儲存日設定 ──
  const saveDay = useCallback(async () => {
    if (!selectedDate || !canManage) return;

    startTransition(async () => {
      try {
        if (editStatus === "open") {
          // 回復為每週預設 → 移除特殊設定
          await removeSpecialDayByDate(selectedDate);
        } else {
          // 新增/更新特殊日期
          const result = await addSpecialDay({
            date: selectedDate,
            type: editStatus === "custom" ? "custom" : editStatus,
            reason: editReason || undefined,
            openTime: editStatus === "custom" ? editOpenTime : undefined,
            closeTime: editStatus === "custom" ? editCloseTime : undefined,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
        }

        // 複製到未來 N 週
        if (copyWeeks > 0 && editStatus !== "open") {
          const copyResult = await copySettingsToFutureWeeks({
            sourceDate: selectedDate,
            type: editStatus === "custom" ? "custom" : editStatus,
            reason: editReason || undefined,
            openTime: editStatus === "custom" ? editOpenTime : undefined,
            closeTime: editStatus === "custom" ? editCloseTime : undefined,
            weeks: copyWeeks,
          });
          if (copyResult.success) {
            toast.success(`已套用到未來 ${copyResult.data.count} 週`);
          }
        } else {
          toast.success("設定已儲存");
        }

        // 重新載入月份資料
        const newSpecials = await getMonthSpecialDays(year, month);
        setSpecialDays(newSpecials);
        await selectDate(selectedDate);
      } catch {
        toast.error("儲存失敗");
      }
    });
  }, [selectedDate, canManage, editStatus, editReason, editOpenTime, editCloseTime, copyWeeks, year, month, selectDate]);

  // ── 儲存每週固定設定 ──
  const saveWeeklyDay = useCallback(async (dow: number, isOpen: boolean, openTime: string, closeTime: string) => {
    if (!canManage) return;
    startTransition(async () => {
      const result = await updateBusinessHours(dow, {
        isOpen,
        openTime: isOpen ? openTime : null,
        closeTime: isOpen ? closeTime : null,
      });
      if (result.success) {
        toast.success("每週預設已更新");
        setWeeklyHours((prev) =>
          prev.map((w) => w.dayOfWeek === dow ? { ...w, isOpen, openTime: isOpen ? openTime : null, closeTime: isOpen ? closeTime : null } : w)
        );
      } else {
        toast.error(result.error);
      }
    });
  }, [canManage]);

  // ── 渲染 ──
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
      {/* ===== 左側：月曆 ===== */}
      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          {/* 月份切換 */}
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100">← 上月</button>
            <h2 className="text-base font-bold text-earth-900">{year} 年 {month} 月</h2>
            <button onClick={() => changeMonth(1)} className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100">下月 →</button>
          </div>

          {/* 圖例 */}
          <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-earth-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-200" /> 正常營業</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-earth-300" /> 公休</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-200" /> 進修</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-200" /> 特殊時段</span>
          </div>

          {/* 日曆格子 */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-1 text-center text-xs font-medium text-earth-500">{d}</div>
            ))}
            {/* 前方空格 */}
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* 日期格 */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dow = (startDow + i) % 7;
              const color = getDayColor(dateStr, dow);
              const label = getDayLabel(dateStr, dow);
              const isSelected = selectedDate === dateStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(dateStr)}
                  className={`relative flex h-10 items-center justify-center rounded-lg text-sm font-medium transition ${color} ${
                    isSelected ? "ring-2 ring-primary-500 ring-offset-1" : "hover:ring-1 hover:ring-earth-300"
                  }`}
                >
                  {day}
                  {label && (
                    <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold">{label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== 每週固定規則（可摺疊）===== */}
        <div className="rounded-xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowWeekly(!showWeekly)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <h3 className="text-sm font-semibold text-earth-800">每週固定規則</h3>
            <svg className={`h-4 w-4 text-earth-400 transition ${showWeekly ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showWeekly && (
            <div className="border-t px-4 pb-4">
              <p className="mb-3 pt-3 text-xs text-earth-400">設定每週預設營業時間，個別日期的特殊設定會覆蓋此規則</p>
              <div className="space-y-2">
                {weeklyHours.map((w) => (
                  <WeeklyDayRow
                    key={w.dayOfWeek}
                    day={w}
                    canManage={canManage}
                    isPending={isPending}
                    onSave={saveWeeklyDay}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== 右側：日設定面板 ===== */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        {!selectedDate ? (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-center text-sm text-earth-400">← 點選月曆上的日期來檢視或設定</p>
          </div>
        ) : loadingDay ? (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex items-center justify-center gap-2 py-8">
              <svg className="h-5 w-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-earth-500">載入中...</span>
            </div>
          </div>
        ) : dayDetail ? (
          <div className="space-y-3">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-base font-bold text-earth-900">
                {selectedDate} ({dayDetail.dayName})
              </h3>
              {dayDetail.weeklyDefault && (
                <p className="mb-3 text-xs text-earth-400">
                  每週預設：{dayDetail.weeklyDefault.isOpen
                    ? `${dayDetail.weeklyDefault.openTime} - ${dayDetail.weeklyDefault.closeTime}`
                    : "公休"}
                </p>
              )}

              {/* 狀態選擇 */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-earth-600">當日狀態</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { value: "open", label: "正常營業", color: "bg-green-100 text-green-700 ring-green-400" },
                    { value: "closed", label: "店休", color: "bg-earth-100 text-earth-600 ring-earth-400" },
                    { value: "training", label: "進修", color: "bg-red-100 text-red-600 ring-red-400" },
                    { value: "custom", label: "自訂時段", color: "bg-blue-100 text-blue-700 ring-blue-400" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!canManage}
                      onClick={() => setEditStatus(opt.value as typeof editStatus)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                        editStatus === opt.value
                          ? `${opt.color} ring-2`
                          : "bg-earth-50 text-earth-500 hover:bg-earth-100"
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 自訂時段：時間設定 */}
              {editStatus === "custom" && (
                <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <label className="mb-1.5 block text-xs font-medium text-blue-800">可預約時段範圍（24 小時制）</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={editOpenTime}
                      onChange={(e) => setEditOpenTime(e.target.value)}
                      disabled={!canManage}
                      className="rounded border border-earth-300 px-2 py-1.5 text-sm"
                    />
                    <span className="text-earth-400">~</span>
                    <input
                      type="time"
                      value={editCloseTime}
                      onChange={(e) => setEditCloseTime(e.target.value)}
                      disabled={!canManage}
                      className="rounded border border-earth-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* 原因 */}
              {(editStatus === "closed" || editStatus === "training" || editStatus === "custom") && (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-earth-600">原因（選填）</label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    disabled={!canManage}
                    placeholder="例：員工旅遊、店面整修..."
                    maxLength={100}
                    className="w-full rounded-lg border border-earth-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
              )}

              {/* 套用到未來幾週 */}
              {editStatus !== "open" && canManage && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="mb-1 block text-xs font-medium text-amber-800">複製到未來幾週同星期</label>
                  <select
                    value={copyWeeks}
                    onChange={(e) => setCopyWeeks(Number(e.target.value))}
                    className="rounded border border-earth-300 px-2 py-1.5 text-sm"
                  >
                    <option value={0}>只改這天</option>
                    <option value={2}>未來 2 週</option>
                    <option value={4}>未來 4 週</option>
                    <option value={8}>未來 8 週</option>
                    <option value={12}>未來 12 週</option>
                  </select>
                </div>
              )}

              {/* 儲存 / 回復按鈕 */}
              {canManage && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveDay}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {isPending ? "儲存中..." : "儲存設定"}
                  </button>
                  {dayDetail.specialDayId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditStatus("open");
                        setCopyWeeks(0);
                      }}
                      className="rounded-lg border border-earth-200 px-3 py-2 text-sm text-earth-600 hover:bg-earth-50"
                    >
                      回復預設
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 該日可預約時段預覽 */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h4 className="mb-2 text-xs font-semibold text-earth-700">該日可預約時段預覽</h4>
              {editStatus === "closed" || editStatus === "training" ? (
                <p className="py-4 text-center text-sm text-earth-400">
                  {editStatus === "closed" ? "店休日 — 不開放預約" : "進修日 — 不開放預約"}
                </p>
              ) : dayDetail.slots.length === 0 ? (
                <p className="py-4 text-center text-sm text-earth-400">
                  此日尚未設定預約時段模板
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {dayDetail.slots.map((s) => {
                    const isActive = editStatus === "open"
                      ? s.isEnabled
                      : editStatus === "custom"
                        ? s.startTime >= editOpenTime && s.startTime < editCloseTime && s.isEnabled
                        : false;

                    return (
                      <div
                        key={s.startTime}
                        className={`rounded-lg px-2 py-1.5 text-center text-xs font-medium ${
                          isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-earth-100 text-earth-400 line-through"
                        }`}
                      >
                        {s.startTime}
                        <span className="ml-1 text-[10px] opacity-60">({s.capacity}位)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// 每週固定規則行
// ============================================================

function WeeklyDayRow({
  day,
  canManage,
  isPending,
  onSave,
}: {
  day: WeeklyHour;
  canManage: boolean;
  isPending: boolean;
  onSave: (dow: number, isOpen: boolean, openTime: string, closeTime: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(day.isOpen);
  const [openTime, setOpenTime] = useState(day.openTime ?? "10:00");
  const [closeTime, setCloseTime] = useState(day.closeTime ?? "22:00");
  const [dirty, setDirty] = useState(false);

  function handleToggle() {
    setIsOpen(!isOpen);
    setDirty(true);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-earth-50 px-3 py-2">
      <span className="w-8 text-sm font-medium text-earth-700">{day.dayName}</span>

      <button
        type="button"
        disabled={!canManage}
        onClick={handleToggle}
        className={`relative h-5 w-9 rounded-full transition ${isOpen ? "bg-green-500" : "bg-earth-300"} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${isOpen ? "left-[18px]" : "left-0.5"}`} />
      </button>

      {isOpen ? (
        <>
          <input
            type="time"
            value={openTime}
            onChange={(e) => { setOpenTime(e.target.value); setDirty(true); }}
            disabled={!canManage}
            className="rounded border border-earth-300 px-1.5 py-1 text-xs"
          />
          <span className="text-xs text-earth-400">~</span>
          <input
            type="time"
            value={closeTime}
            onChange={(e) => { setCloseTime(e.target.value); setDirty(true); }}
            disabled={!canManage}
            className="rounded border border-earth-300 px-1.5 py-1 text-xs"
          />
        </>
      ) : (
        <span className="text-xs text-earth-400">公休</span>
      )}

      {dirty && canManage && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            onSave(day.dayOfWeek, isOpen, openTime, closeTime);
            setDirty(false);
          }}
          className="ml-auto rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          儲存
        </button>
      )}
    </div>
  );
}
