"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { toast } from "sonner";
import {
  updateBusinessHours,
  addSpecialDay,
  removeSpecialDayByDate,
  getMonthSpecialDays,
  getMonthScheduleSummary,
  getDaySlotDetails,
  copySettingsToFutureWeeks,
  toggleSlotOverride,
  overrideSlotCapacity,
  applyWeeklyTemplate,
} from "@/server/actions/business-hours";
import { SLOT_INTERVAL_OPTIONS, CAPACITY_OPTIONS } from "@/lib/slot-generator";

// ============================================================
// Types
// ============================================================

interface WeeklyHour {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
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
  slots: {
    startTime: string;
    capacity: number;
    templateCapacity: number;
    isEnabled: boolean;
    inRange: boolean;
    override: string | null;
    overrideReason: string | null;
  }[];
  slotInterval: number;
  defaultCapacity: number;
  weeklyDefault: {
    isOpen: boolean; openTime: string | null; closeTime: string | null;
    slotInterval: number; defaultCapacity: number;
  } | null;
}

type MonthSummary = Record<string, {
  status: "open" | "closed" | "training" | "custom";
  openTime: string | null;
  closeTime: string | null;
  slotCount: number;
  overrideCount: number;
}>;

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
  const [editInterval, setEditInterval] = useState(60);
  const [editCapacity, setEditCapacity] = useState(6);
  // applyMode: "day" = 只改這天, "copy" = 複製到未來N週, "permanent" = 設為每週固定規則, "template" = 排班模板（含時段開關）
  const [applyMode, setApplyMode] = useState<"day" | "copy" | "permanent" | "template">("day");
  const [templateWeeks, setTemplateWeeks] = useState(52);

  // 月曆摘要
  const [monthSummary, setMonthSummary] = useState<MonthSummary>({});

  // 單時段名額調整 - 選中的時段
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotCapacityInput, setSlotCapacityInput] = useState<number>(0);

  // 載入月曆摘要
  useEffect(() => {
    getMonthScheduleSummary(year, month).then(setMonthSummary).catch(() => {});
  }, [year, month]);

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

    // 載入新月份的特殊日期 + 摘要
    const [data, summary] = await Promise.all([
      getMonthSpecialDays(newYear, newMonth),
      getMonthScheduleSummary(newYear, newMonth),
    ]);
    setSpecialDays(data);
    setMonthSummary(summary);
  }, [year, month]);

  // ── 選擇日期 ──
  const selectDate = useCallback(async (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setLoadingDay(true);
    try {
      const detail = await getDaySlotDetails(dateStr);
      setDayDetail(detail);
      setEditStatus(detail.status);
      setEditOpenTime(detail.openTime ?? "10:00");
      setEditCloseTime(detail.closeTime ?? "22:00");
      setEditReason(detail.reason ?? "");
      setEditInterval(detail.slotInterval);
      setEditCapacity(detail.defaultCapacity);
      setCopyWeeks(0);
      setApplyMode("day");
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
        // 「排班模板」模式 → 營業時間 + 時段開關一起複製到未來
        if (applyMode === "template" && dayDetail) {
          const isOpen = editStatus === "open" || editStatus === "custom";
          const result = await applyWeeklyTemplate({
            sourceDate: selectedDate,
            isOpen,
            openTime: isOpen ? editOpenTime : null,
            closeTime: isOpen ? editCloseTime : null,
            slotInterval: editInterval,
            defaultCapacity: editCapacity,
            weeks: templateWeeks,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          // 同步更新本地 weeklyHours
          setWeeklyHours((prev) =>
            prev.map((w) => w.dayOfWeek === dayDetail.dayOfWeek ? {
              ...w,
              isOpen,
              openTime: isOpen ? editOpenTime : null,
              closeTime: isOpen ? editCloseTime : null,
              slotInterval: editInterval,
              defaultCapacity: editCapacity,
            } : w)
          );
          toast.success(`每週${dayDetail.dayName}固定排班已設定（套用 ${result.data.count} 週）`);
        }
        // 「設為每週固定規則」模式 → 只更新營業時間
        else if (applyMode === "permanent" && dayDetail) {
          const dow = dayDetail.dayOfWeek;
          const isOpen = editStatus === "open" || editStatus === "custom";
          const payload = {
            isOpen,
            openTime: isOpen ? editOpenTime : null,
            closeTime: isOpen ? editCloseTime : null,
            slotInterval: editInterval,
            defaultCapacity: editCapacity,
          };

          const result = await updateBusinessHours(dow, payload);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          // ① 每週固定規則已成功更新 → 才移除該日特殊設定（順序不可反）
          try {
            await removeSpecialDayByDate(selectedDate);
          } catch {
            // 刪除特殊設定失敗不影響每週固定規則已更新，僅提醒
            toast.warning("每週固定規則已更新，但該日特殊設定移除失敗，可手動移除");
          }
          // 同步更新本地 weeklyHours
          setWeeklyHours((prev) =>
            prev.map((w) => w.dayOfWeek === dow ? {
              ...w,
              isOpen,
              openTime: isOpen ? editOpenTime : null,
              closeTime: isOpen ? editCloseTime : null,
              slotInterval: editInterval,
              defaultCapacity: editCapacity,
            } : w)
          );
          toast.success(`${dayDetail.dayName} 每週固定規則已更新`);
        } else {
          // 非永久模式：操作特殊日期
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
              defaultCapacity: editStatus === "custom" ? editCapacity : undefined,
            });
            if (!result.success) {
              toast.error(result.error);
              return;
            }
          }

          // 複製到未來 N 週
          if (applyMode === "copy" && copyWeeks > 0 && editStatus !== "open") {
            const copyResult = await copySettingsToFutureWeeks({
              sourceDate: selectedDate,
              type: editStatus === "custom" ? "custom" : editStatus,
              reason: editReason || undefined,
              openTime: editStatus === "custom" ? editOpenTime : undefined,
              closeTime: editStatus === "custom" ? editCloseTime : undefined,
              defaultCapacity: editStatus === "custom" ? editCapacity : undefined,
              weeks: copyWeeks,
            });
            if (copyResult.success) {
              toast.success(`已套用到未來 ${copyResult.data.count} 週`);
            }
          } else {
            toast.success("設定已儲存");
          }
        }

        // 重新載入月份資料
        const [newSpecials, newSummary] = await Promise.all([
          getMonthSpecialDays(year, month),
          getMonthScheduleSummary(year, month),
        ]);
        setSpecialDays(newSpecials);
        setMonthSummary(newSummary);
        await selectDate(selectedDate);
      } catch {
        toast.error("儲存失敗");
      }
    });
  }, [selectedDate, canManage, editStatus, editReason, editOpenTime, editCloseTime, editInterval, editCapacity, applyMode, copyWeeks, templateWeeks, year, month, selectDate, dayDetail]);

  // ── 儲存每週固定設定 ──
  const saveWeeklyDay = useCallback(async (
    dow: number, isOpen: boolean, openTime: string, closeTime: string,
    slotInterval: number, defaultCapacity: number
  ) => {
    if (!canManage) return;
    startTransition(async () => {
      const payload = {
        isOpen,
        openTime: isOpen ? openTime : null,
        closeTime: isOpen ? closeTime : null,
        slotInterval,
        defaultCapacity,
      };

      const result = await updateBusinessHours(dow, payload);
      if (result.success) {
        toast.success("每週預設已更新");
        setWeeklyHours((prev) =>
          prev.map((w) => w.dayOfWeek === dow ? {
            ...w, isOpen,
            openTime: isOpen ? openTime : null,
            closeTime: isOpen ? closeTime : null,
            slotInterval, defaultCapacity,
          } : w)
        );
        // 重新載入月份摘要 + 當前選中日期，讓月曆即時反映新規則
        const [newSpecials, newSummary] = await Promise.all([
          getMonthSpecialDays(year, month),
          getMonthScheduleSummary(year, month),
        ]);
        setSpecialDays(newSpecials);
        setMonthSummary(newSummary);
        if (selectedDate) {
          await selectDate(selectedDate);
        }
      } else {
        toast.error(result.error);
      }
    });
  }, [canManage, year, month, selectedDate, selectDate]);

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
              const summary = monthSummary[dateStr];

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(dateStr)}
                  className={`relative flex h-14 flex-col items-center justify-center rounded-lg text-sm font-medium transition ${color} ${
                    isSelected ? "ring-2 ring-primary-500 ring-offset-1" : "hover:ring-1 hover:ring-earth-300"
                  }`}
                >
                  <span className="leading-tight">{day}</span>
                  {summary?.openTime && summary?.closeTime ? (
                    <span className="text-[9px] leading-tight opacity-70">
                      {summary.openTime.slice(0, 5)}–{summary.closeTime.slice(0, 5)}
                    </span>
                  ) : label ? (
                    <span className="text-[9px] leading-tight font-bold">{label}</span>
                  ) : null}
                  {summary && summary.overrideCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-white">{summary.overrideCount}</span>
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
              <h3 className="mb-2 text-base font-bold text-earth-900">
                {selectedDate} ({dayDetail.dayName})
              </h3>

              {/* 規則推導 */}
              <CascadeInfo dayDetail={dayDetail} />

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

              {/* 時段設定：custom 模式、permanent+open、template+open 都顯示 */}
              {(editStatus === "custom" || (editStatus === "open" && (applyMode === "permanent" || applyMode === "template"))) && (
                <div className="mb-3 space-y-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div>
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
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-blue-700">時段間隔</label>
                      <select
                        value={editInterval}
                        onChange={(e) => setEditInterval(Number(e.target.value))}
                        disabled={!canManage}
                        className="w-full rounded border border-earth-300 px-2 py-1.5 text-xs"
                      >
                        {SLOT_INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-blue-700">每時段名額</label>
                      <select
                        value={editCapacity}
                        onChange={(e) => setEditCapacity(Number(e.target.value))}
                        disabled={!canManage}
                        className="w-full rounded border border-earth-300 px-2 py-1.5 text-xs"
                      >
                        {CAPACITY_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c} 位</option>
                        ))}
                      </select>
                    </div>
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

              {/* 套用範圍 */}
              {canManage && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="mb-2 block text-xs font-medium text-amber-800">套用範圍</label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-earth-700">
                      <input
                        type="radio"
                        name="applyMode"
                        value="day"
                        checked={applyMode === "day"}
                        onChange={() => { setApplyMode("day"); setCopyWeeks(0); }}
                        className="accent-primary-600"
                      />
                      只改這天
                    </label>
                    {editStatus !== "open" && (
                      <label className="flex items-center gap-2 text-xs text-earth-700">
                        <input
                          type="radio"
                          name="applyMode"
                          value="copy"
                          checked={applyMode === "copy"}
                          onChange={() => setApplyMode("copy")}
                          className="accent-primary-600"
                        />
                        複製到未來
                        <select
                          value={copyWeeks}
                          onChange={(e) => { setCopyWeeks(Number(e.target.value)); setApplyMode("copy"); }}
                          className="rounded border border-earth-300 px-1.5 py-0.5 text-xs"
                        >
                          <option value={2}>2 週</option>
                          <option value={4}>4 週</option>
                          <option value={8}>8 週</option>
                          <option value={12}>12 週</option>
                        </select>
                      </label>
                    )}
                    {(editStatus === "open" || editStatus === "custom") && (
                      <>
                        <label className="flex items-center gap-2 text-xs text-earth-700">
                          <input
                            type="radio"
                            name="applyMode"
                            value="permanent"
                            checked={applyMode === "permanent"}
                            onChange={() => setApplyMode("permanent")}
                            className="accent-primary-600"
                          />
                          <span>
                            更新每週{dayDetail?.dayName}營業時間
                            <span className="ml-1 text-[10px] text-earth-400">僅時間/名額</span>
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-earth-700">
                          <input
                            type="radio"
                            name="applyMode"
                            value="template"
                            checked={applyMode === "template"}
                            onChange={() => setApplyMode("template")}
                            className="accent-primary-600"
                          />
                          <div>
                            <span>設定每週{dayDetail?.dayName}固定排班</span>
                            <span className="ml-1 text-[10px] text-earth-400">含時段開關</span>
                            <div className="mt-0.5 text-[10px] text-earth-400">會套用到未來所有週</div>
                          </div>
                          <select
                            value={templateWeeks}
                            onChange={(e) => { setTemplateWeeks(Number(e.target.value)); setApplyMode("template"); }}
                            className="ml-auto rounded border border-earth-300 px-1.5 py-0.5 text-xs"
                          >
                            <option value={52}>無限</option>
                            <option value={4}>4 週</option>
                            <option value={8}>8 週</option>
                            <option value={12}>12 週</option>
                            <option value={26}>26 週</option>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
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

            {/* 該日可預約時段控制 */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-earth-700">該日可預約時段</h4>
                {canManage && dayDetail.slots.length > 0 && editStatus !== "closed" && editStatus !== "training" && (
                  <span className="text-[10px] text-earth-400">點擊切換開/關</span>
                )}
              </div>
              {editStatus === "closed" || editStatus === "training" ? (
                <p className="py-4 text-center text-sm text-earth-400">
                  {editStatus === "closed" ? "店休日 — 不開放預約" : "進修日 — 不開放預約"}
                </p>
              ) : dayDetail.slots.length === 0 ? (
                <p className="py-4 text-center text-sm text-earth-400">
                  此日尚未設定預約時段模板
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {dayDetail.slots.map((s) => (
                      <SlotToggleButton
                        key={s.startTime}
                        slot={s}
                        date={selectedDate}
                        editStatus={editStatus}
                        editOpenTime={editOpenTime}
                        editCloseTime={editCloseTime}
                        canManage={canManage}
                        isSelected={selectedSlot === s.startTime}
                        onToggled={() => { setSelectedSlot(null); selectDate(selectedDate); }}
                        onSelect={(startTime) => {
                          if (selectedSlot === startTime) {
                            setSelectedSlot(null);
                          } else {
                            setSelectedSlot(startTime);
                            const slot = dayDetail.slots.find((x) => x.startTime === startTime);
                            setSlotCapacityInput(slot?.capacity ?? dayDetail.defaultCapacity);
                          }
                        }}
                      />
                    ))}
                  </div>

                  {/* 名額調整控制列 */}
                  {selectedSlot && canManage && (() => {
                    const slot = dayDetail.slots.find((s) => s.startTime === selectedSlot);
                    if (!slot) return null;
                    return (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2">
                        <span className="text-xs font-medium text-earth-700">{selectedSlot}</span>
                        <span className="text-[10px] text-earth-400">預設 {slot.templateCapacity} 位</span>
                        <span className="text-earth-400">→</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={slotCapacityInput}
                          onChange={(e) => setSlotCapacityInput(Number(e.target.value))}
                          className="w-14 rounded border border-earth-300 px-1.5 py-0.5 text-center text-xs"
                        />
                        <span className="text-[10px] text-earth-400">位</span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={async () => {
                            startTransition(async () => {
                              const result = await overrideSlotCapacity({
                                date: selectedDate,
                                startTime: selectedSlot,
                                capacity: slotCapacityInput,
                              });
                              if (result.success) {
                                toast.success(`${selectedSlot} 名額已調整為 ${slotCapacityInput} 位`);
                                setSelectedSlot(null);
                                const [, newSummary] = await Promise.all([
                                  selectDate(selectedDate),
                                  getMonthScheduleSummary(year, month),
                                ]);
                                setMonthSummary(newSummary);
                              } else {
                                toast.error(result.error);
                              }
                            });
                          }}
                          className="rounded bg-primary-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                        >
                          {isPending ? "..." : "儲存"}
                        </button>
                        {slot.override === "capacity_change" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={async () => {
                              startTransition(async () => {
                                const result = await toggleSlotOverride({
                                  date: selectedDate,
                                  startTime: selectedSlot,
                                  action: "remove",
                                });
                                if (result.success) {
                                  toast.success(`${selectedSlot} 已回復預設名額`);
                                  setSelectedSlot(null);
                                  const [, newSummary] = await Promise.all([
                                    selectDate(selectedDate),
                                    getMonthScheduleSummary(year, month),
                                  ]);
                                  setMonthSummary(newSummary);
                                } else {
                                  toast.error(result.error);
                                }
                              });
                            }}
                            className="rounded border border-earth-300 px-2 py-0.5 text-[10px] text-earth-500 hover:bg-earth-50 disabled:opacity-60"
                          >
                            回復預設
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
              {dayDetail.slots.some((s) => s.override) && (
                <p className="mt-2 text-[10px] text-amber-600">
                  ⚡ 有手動覆寫的時段（黃框 = 強制開放，紅框 = 手動關閉，右鍵選取調整名額）
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// 規則推導摘要
// ============================================================

function CascadeInfo({ dayDetail }: { dayDetail: DayDetail }) {
  const wd = dayDetail.weeklyDefault;
  const hasOverride = dayDetail.specialDayId !== null;
  const disabledCount = dayDetail.slots.filter((s) => s.override === "disabled").length;
  const enabledCount = dayDetail.slots.filter((s) => s.override === "enabled").length;
  const capChangeCount = dayDetail.slots.filter((s) => s.override === "capacity_change").length;
  const activeSlots = dayDetail.slots.filter((s) => s.isEnabled).length;
  const overrideParts: string[] = [];
  if (disabledCount > 0) overrideParts.push(`${disabledCount} 關閉`);
  if (enabledCount > 0) overrideParts.push(`${enabledCount} 強制開放`);
  if (capChangeCount > 0) overrideParts.push(`${capChangeCount} 名額調整`);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg bg-earth-50 px-3 py-2 text-[11px] text-earth-600">
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-semibold text-earth-500">1 每週預設</span>
        <span>
          {wd
            ? wd.isOpen
              ? `${wd.openTime}–${wd.closeTime} / ${wd.slotInterval}分 / ${wd.defaultCapacity}位`
              : "公休"
            : "未設定"}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-semibold text-earth-500">2 當日覆寫</span>
        <span>
          {!hasOverride
            ? "無（依照每週預設）"
            : dayDetail.status === "closed"
              ? `店休${dayDetail.reason ? `（${dayDetail.reason}）` : ""}`
              : dayDetail.status === "training"
                ? `進修${dayDetail.reason ? `（${dayDetail.reason}）` : ""}`
                : `自訂 ${dayDetail.openTime}–${dayDetail.closeTime} / ${dayDetail.slotInterval}分 / ${dayDetail.defaultCapacity}位`}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-semibold text-earth-500">3 最終結果</span>
        <span>
          {dayDetail.status === "closed" || dayDetail.status === "training"
            ? "不營業"
            : `${activeSlots} 個可用時段 / ${dayDetail.defaultCapacity}位`}
          {overrideParts.length > 0 && (
            <span className="ml-1 text-amber-600">({overrideParts.join(", ")})</span>
          )}
        </span>
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
  onSave: (dow: number, isOpen: boolean, openTime: string, closeTime: string, slotInterval: number, defaultCapacity: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(day.isOpen);
  const [openTime, setOpenTime] = useState(day.openTime ?? "10:00");
  const [closeTime, setCloseTime] = useState(day.closeTime ?? "22:00");
  const [interval, setInterval] = useState(day.slotInterval);
  const [capacity, setCapacity] = useState(day.defaultCapacity);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleToggle() {
    setIsOpen(!isOpen);
    setDirty(true);
  }

  return (
    <div className="rounded-lg bg-earth-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm font-medium text-earth-700">{day.dayName}</span>

        <button
          type="button"
          disabled={!canManage}
          onClick={handleToggle}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${isOpen ? "bg-green-500" : "bg-earth-300"} disabled:opacity-50`}
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
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="ml-auto text-[10px] text-earth-400 hover:text-earth-600"
              title="展開時段/名額設定"
            >
              {expanded ? "收合 ▲" : `${interval}分/${capacity}位 ▼`}
            </button>
          </>
        ) : (
          <span className="text-xs text-earth-400">公休</span>
        )}

        {dirty && canManage && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              onSave(day.dayOfWeek, isOpen, openTime, closeTime, interval, capacity);
              setDirty(false);
            }}
            className={`${isOpen && !expanded ? "" : "ml-auto"} shrink-0 rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-60`}
          >
            儲存
          </button>
        )}
      </div>

      {/* 展開的間隔/名額設定 */}
      {isOpen && expanded && (
        <div className="mt-2 flex items-center gap-3 border-t border-earth-200 pt-2">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-earth-500">間隔</label>
            <select
              value={interval}
              onChange={(e) => { setInterval(Number(e.target.value)); setDirty(true); }}
              disabled={!canManage}
              className="rounded border border-earth-300 px-1 py-0.5 text-[11px]"
            >
              {SLOT_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-earth-500">名額</label>
            <select
              value={capacity}
              onChange={(e) => { setCapacity(Number(e.target.value)); setDirty(true); }}
              disabled={!canManage}
              className="rounded border border-earth-300 px-1 py-0.5 text-[11px]"
            >
              {CAPACITY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c} 位</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 時段開關按鈕（支援三態切換：預設 → 關閉 → 強制開放 → 移除覆寫）
// ============================================================

function SlotToggleButton({
  slot,
  date,
  editStatus,
  editOpenTime,
  editCloseTime,
  canManage,
  isSelected,
  onToggled,
  onSelect,
}: {
  slot: {
    startTime: string;
    capacity: number;
    templateCapacity: number;
    isEnabled: boolean;
    inRange: boolean;
    override: string | null;
    overrideReason: string | null;
  };
  date: string;
  editStatus: string;
  editOpenTime: string;
  editCloseTime: string;
  canManage: boolean;
  isSelected: boolean;
  onToggled: () => void;
  onSelect: (startTime: string) => void;
}) {
  const [toggling, setToggling] = useState(false);

  // 計算此時段的顯示狀態
  const wouldBeActive = editStatus === "open"
    ? slot.isEnabled
    : editStatus === "custom"
      ? slot.startTime >= editOpenTime && slot.startTime < editCloseTime && slot.isEnabled
      : false;

  // 有 override 時以 override 為準
  const isActive = slot.override === "disabled" ? false
    : slot.override === "enabled" ? true
    : wouldBeActive;

  const handleClick = async () => {
    if (!canManage || toggling) return;

    setToggling(true);
    try {
      let action: "disable" | "enable" | "remove";

      if (slot.override === "disabled") {
        // 已關閉 → 移除覆寫（回到預設）
        action = "remove";
      } else if (slot.override === "enabled") {
        // 已強制開放 → 移除覆寫（回到預設）
        action = "remove";
      } else if (isActive) {
        // 預設開放 → 手動關閉
        action = "disable";
      } else {
        // 預設關閉（超出範圍）→ 強制開放
        action = "enable";
      }

      const result = await toggleSlotOverride({
        date,
        startTime: slot.startTime,
        action,
      });
      if (!result.success) {
        toast.error(result.error);
      } else {
        const msgs: Record<string, string> = {
          disable: `${slot.startTime} 已關閉`,
          enable: `${slot.startTime} 已強制開放`,
          remove: `${slot.startTime} 已回復預設`,
        };
        toast.success(msgs[action]);
        onToggled();
      }
    } catch {
      toast.error("操作失敗");
    } finally {
      setToggling(false);
    }
  };

  // 樣式：根據狀態和 override 類型決定
  let className = "rounded-lg px-2 py-1.5 text-center text-xs font-medium transition ";
  if (toggling) {
    className += "bg-earth-50 text-earth-300 animate-pulse";
  } else if (slot.override === "disabled") {
    className += "bg-red-50 text-red-400 line-through ring-1 ring-red-300";
  } else if (slot.override === "enabled") {
    className += "bg-amber-50 text-amber-700 ring-1 ring-amber-400";
  } else if (isActive) {
    className += "bg-green-100 text-green-700";
  } else {
    className += "bg-earth-100 text-earth-400 line-through";
  }

  if (isSelected) {
    className += " ring-2 ring-primary-500";
  } else if (canManage) {
    className += " cursor-pointer hover:ring-2 hover:ring-primary-300";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (canManage) onSelect(slot.startTime);
      }}
      disabled={!canManage || toggling}
      className={className}
      title={
        slot.override === "disabled"
          ? `手動關閉${slot.overrideReason ? `：${slot.overrideReason}` : ""}（點擊回復）`
          : slot.override === "enabled"
            ? `強制開放${slot.overrideReason ? `：${slot.overrideReason}` : ""}（點擊回復）`
            : isActive
              ? `${slot.startTime}（${slot.capacity}位）— 左鍵切換開/關，右鍵調整名額`
              : `${slot.startTime}（超出範圍）— 點擊強制開放`
      }
    >
      {slot.startTime}
      <span className={`ml-1 text-[10px] ${slot.override === "capacity_change" ? "font-bold text-amber-600" : "opacity-60"}`}>
        ({slot.capacity}位)
      </span>
      {slot.override === "disabled" && <span className="ml-0.5 text-[9px]">✕</span>}
      {slot.override === "enabled" && <span className="ml-0.5 text-[9px]">⚡</span>}
      {slot.override === "capacity_change" && <span className="ml-0.5 text-[9px]">✎</span>}
    </button>
  );
}
