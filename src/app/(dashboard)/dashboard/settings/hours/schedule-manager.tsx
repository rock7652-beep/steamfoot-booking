"use client";

import { useState, useCallback, useTransition, useEffect, useMemo, useRef } from "react";
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
  syncFromHeadquarters,
} from "@/server/actions/business-hours";
import { SLOT_INTERVAL_OPTIONS, CAPACITY_OPTIONS, generateSlots, validateBusinessPeriods } from "@/lib/slot-generator";

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
  periods?: BusinessPeriod[];
}

interface BusinessPeriod {
  openTime: string;
  closeTime: string;
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
  periods: BusinessPeriod[];
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

/**
 * Phase B 月份 client cache 條目。
 * summary 與 specialDays 配對 — 兩者都是「per-月」資料，總是一起讀取/失效。
 */
type MonthCacheEntry = {
  summary: MonthSummary;
  specialDays: SpecialDay[];
};

const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

interface Props {
  weeklyHours: WeeklyHour[];
  initialSpecialDays: SpecialDay[];
  /**
   * Server-cache 算好的初始月份摘要（getCachedMonthScheduleSummary）。
   * 傳進來後 client mount 不必再打 server 補抓 summary，第一個進來的人
   * 也是秒開；client cache 也直接用這份 seed。
   */
  initialSummary: MonthSummary;
  initialYear: number;
  initialMonth: number;
  canManage: boolean;
  isHeadquarters: boolean;
  isSpaStore: boolean;
}

const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

function editablePeriods(periods: BusinessPeriod[], fallbackInterval: number, fallbackCapacity: number) {
  return periods.length > 0 ? periods.map((period) => ({ ...period })) : [
    { openTime: "10:00", closeTime: "22:00", slotInterval: fallbackInterval, defaultCapacity: fallbackCapacity },
  ];
}

// ============================================================
// Component
// ============================================================

export function ScheduleManager({
  weeklyHours: initialWeekly,
  initialSpecialDays,
  initialSummary,
  initialYear,
  initialMonth,
  canManage,
  isHeadquarters,
  isSpaStore,
}: Props) {
  // 蒸足採 30/60/90/120；SPA 保留既有 15/30 排程設定，不受此頁變更影響。
  const intervalOptions = isSpaStore
    ? SLOT_INTERVAL_OPTIONS.filter((option) => option.value === 15 || option.value === 30)
    : SLOT_INTERVAL_OPTIONS.filter((option) => option.value !== 15);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>(initialSpecialDays);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [weeklyHours, setWeeklyHours] = useState(initialWeekly);
  const [isPending, startTransition] = useTransition();
  const [loadingDay, setLoadingDay] = useState(false);
  const [reviewedDraft, setReviewedDraft] = useState<string | null>(null);

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
  const [editPeriods, setEditPeriods] = useState<BusinessPeriod[]>([
    { openTime: "10:00", closeTime: "22:00", slotInterval: 60, defaultCapacity: 6 },
  ]);
  // applyMode: "day" = 只改這天, "copy" = 複製到未來N週, "permanent" = 設為每週固定規則, "template" = 排班模板（含時段開關）
  const [applyMode, setApplyMode] = useState<"day" | "copy" | "permanent" | "template">("day");
  const [templateWeeks, setTemplateWeeks] = useState(52);

  // 月曆摘要 — 用 server-cache 給的 initialSummary 當啟動值，第一次 render 已正確
  const [monthSummary, setMonthSummary] = useState<MonthSummary>(initialSummary);

  // 單時段名額調整 - 選中的時段
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotCapacityInput, setSlotCapacityInput] = useState<number>(0);
  const [showAdvancedSlots, setShowAdvancedSlots] = useState(false);

  // ── Phase B: client 月份 cache + race guard ──────────
  // 月份切換時不要每次都打 server。已看過的月份直接從 Map 拿；
  // 切到新月份才打 server，期間顯示 loading overlay 並 disable 上下月按鈕。
  // requestIdRef 防止使用者快速連點：較慢回來的請求不會覆蓋當前狀態。
  const monthCacheRef = useRef<Map<string, MonthCacheEntry>>(new Map());
  const requestIdRef = useRef(0);
  const [isMonthLoading, setIsMonthLoading] = useState(false);

  const dayDraftDirty = useMemo(() => {
    if (!dayDetail) return false;
    return applyMode !== "day"
      || editStatus !== dayDetail.status
      || editReason !== (dayDetail.reason ?? "")
      || JSON.stringify(editPeriods) !== JSON.stringify(editablePeriods(dayDetail.periods, dayDetail.slotInterval, dayDetail.defaultCapacity));
  }, [applyMode, dayDetail, editPeriods, editReason, editStatus]);

  const draftSlotPreview = useMemo(() => {
    if (editStatus !== "custom") return [];
    return editPeriods.flatMap((period) =>
      generateSlots(period.openTime, period.closeTime, period.slotInterval, period.defaultCapacity),
    );
  }, [editPeriods, editStatus]);

  const draftKey = JSON.stringify([selectedDate, editStatus, editPeriods, editReason, applyMode, copyWeeks, templateWeeks, dayDetail?.slots]);
  const reviewing = reviewedDraft === draftKey;
  const periodValidation = editStatus === "custom" || (editStatus === "open" && applyMode !== "day")
    ? validateBusinessPeriods(editPeriods) : { valid: true };
  const currentTimes = new Set(dayDetail?.slots.filter((slot) => slot.isEnabled).map((slot) => slot.startTime));
  const previewTimes = new Set(draftSlotPreview.map((slot) => slot.startTime));
  const addedTimes = [...previewTimes].filter((time) => !currentTimes.has(time));
  const removedTimes = [...currentTimes].filter((time) => !previewTimes.has(time));
  const scopeLabel = applyMode === "day" ? `只修改 ${selectedDate}`
    : applyMode === "copy" ? `${selectedDate}，以及未來 ${copyWeeks} 週的${dayDetail?.dayName}`
    : applyMode === "permanent" ? `更新每週${dayDetail?.dayName}固定服務時間`
    : `更新每週${dayDetail?.dayName}固定排班（${templateWeeks} 週）`;

  useEffect(() => {
    if (!dayDraftDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dayDraftDirty]);

  /** 失效並強制重抓「目前月份」cache（mutation 後使用） */
  const invalidateAndReloadCurrentMonth = useCallback(async () => {
    const key = monthKey(year, month);
    monthCacheRef.current.delete(key);
    const requestId = ++requestIdRef.current;
    try {
      const [specials, summary] = await Promise.all([
        getMonthSpecialDays(year, month),
        getMonthScheduleSummary(year, month),
      ]);
      if (requestId !== requestIdRef.current) return;
      monthCacheRef.current.set(key, { summary, specialDays: specials });
      setSpecialDays(specials);
      setMonthSummary(summary);
    } catch {
      // 失敗時保持舊狀態，由各 mutation 的 toast 自行回報錯誤
    }
  }, [year, month]);

  /** 載入指定月份：cache hit 秒開、cache miss 走 server + race guard */
  const loadMonth = useCallback(async (targetYear: number, targetMonth: number) => {
    const key = monthKey(targetYear, targetMonth);
    const cached = monthCacheRef.current.get(key);
    if (cached) {
      setSpecialDays(cached.specialDays);
      setMonthSummary(cached.summary);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsMonthLoading(true);
    try {
      const [specials, summary] = await Promise.all([
        getMonthSpecialDays(targetYear, targetMonth),
        getMonthScheduleSummary(targetYear, targetMonth),
      ]);
      // 慢回來的舊請求不要覆蓋已經切到下一個月的狀態
      if (requestId !== requestIdRef.current) return;
      monthCacheRef.current.set(key, { summary, specialDays: specials });
      setSpecialDays(specials);
      setMonthSummary(summary);
    } catch {
      // ignore — 保留舊狀態
    } finally {
      if (requestId === requestIdRef.current) setIsMonthLoading(false);
    }
  }, []);

  // 初次掛載：seed cache 用 props（specialDays + initialSummary 都從 server cache 拿到）。
  // 不再打 server 補抓 — initialSummary 已是正確值。
  useEffect(() => {
    monthCacheRef.current.set(monthKey(initialYear, initialMonth), {
      summary: initialSummary,
      specialDays: initialSpecialDays,
    });
    // 只在 mount 時執行一次；後續 month 變化由 changeMonth 觸發 loadMonth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dayDetail) return;
    setEditPeriods(dayDetail.periods.length > 0 ? dayDetail.periods : [
      {
        openTime: dayDetail.openTime ?? "10:00",
        closeTime: dayDetail.closeTime ?? "22:00",
        slotInterval: dayDetail.slotInterval ?? 60,
        defaultCapacity: dayDetail.defaultCapacity ?? 6,
      },
    ]);
  }, [dayDetail]);

  useEffect(() => {
    setShowAdvancedSlots(false);
  }, [selectedDate]);

  // ── Day detail client cache ──────────────────────────
  // 點同一天第二次直接從 Map 拿，不打 server。
  // bypassCache: true 用於 mutation 後強制重抓（slot toggle / capacity / saveDay）。
  // 月份切換不清這份 cache — 切回同月再點同一天也是秒開。
  const dayDetailCacheRef = useRef<Map<string, DayDetail>>(new Map());

  /**
   * 用 monthSummary + weeklyHours 組出「點下去立刻顯示」的預覽 DayDetail，
   * 讓上方資訊卡（日期 / 狀態 / 營業時間 / 規則推導）在等 server 期間
   * 不是空白 loading。slots 仍維持空陣列，由下方 skeleton 用
   * monthSummary.slotCount 算出佔位格數，server 回來再覆蓋。
   */
  const WEEK_DAY_FULL = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const buildPreviewDayDetail = useCallback(
    (dateStr: string): DayDetail | null => {
      const summary = monthSummary[dateStr];
      if (!summary) return null;
      const dateObj = new Date(dateStr + "T00:00:00Z");
      const dow = dateObj.getUTCDay();
      const weekly = weeklyHours.find((w) => w.dayOfWeek === dow) ?? null;
      return {
        status: summary.status,
        openTime: summary.openTime,
        closeTime: summary.closeTime,
        reason: null,
        specialDayId: null,
        dayOfWeek: dow,
        dayName: WEEK_DAY_FULL[dow],
        slots: [],
        slotInterval: weekly?.slotInterval ?? 60,
        defaultCapacity: weekly?.defaultCapacity ?? 6,
        periods: weekly?.periods?.length ? weekly.periods : weekly?.openTime && weekly?.closeTime ? [{
          openTime: weekly.openTime,
          closeTime: weekly.closeTime,
          slotInterval: weekly.slotInterval,
          defaultCapacity: weekly.defaultCapacity,
        }] : [],
        weeklyDefault: weekly
          ? {
              isOpen: weekly.isOpen,
              openTime: weekly.openTime,
              closeTime: weekly.closeTime,
              slotInterval: weekly.slotInterval,
              defaultCapacity: weekly.defaultCapacity,
            }
          : null,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthSummary, weeklyHours],
  );

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
    if (dayDraftDirty && !window.confirm("目前日期有尚未儲存的修改，仍要切換月份嗎？")) return;
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setYear(newYear);
    setMonth(newMonth);
    setSelectedDate(null);
    setDayDetail(null);
    // cache hit: 立即同步顯示；cache miss: loadMonth 內部走 server + race guard
    await loadMonth(newYear, newMonth);
  }, [year, month, loadMonth, dayDraftDirty]);

  // ── 選擇日期 ──
  // 流程：
  //  1) 同一個 requestId 防 race（快速連點不同日期不會錯位）
  //  2) cache hit（除非 bypassCache）→ 同步 setState，不打 server
  //  3) cache miss → 從 monthSummary 拼預覽 DayDetail 立即顯示，slots 空著
  //     由下方 skeleton 用 slotCount 撐版面；同時背景 fetch server，
  //     回來後 race-guard 過濾、寫 cache、覆蓋 dayDetail
  const selectDate = useCallback(
    async (dateStr: string, opts: { bypassCache?: boolean } = {}) => {
      if (selectedDate && selectedDate !== dateStr && dayDraftDirty && !window.confirm("目前日期有尚未儲存的修改，仍要切換日期嗎？")) return;
      setSelectedDate(dateStr);
      setSelectedSlot(null);

      const requestId = ++requestIdRef.current;

      // Cache hit → instant
      if (!opts.bypassCache) {
        const cached = dayDetailCacheRef.current.get(dateStr);
        if (cached) {
          setDayDetail(cached);
          setEditStatus(cached.status);
          setEditOpenTime(cached.openTime ?? "10:00");
          setEditCloseTime(cached.closeTime ?? "22:00");
          setEditReason(cached.reason ?? "");
          setEditInterval(cached.slotInterval);
          setEditCapacity(cached.defaultCapacity);
          setEditPeriods(editablePeriods(cached.periods, cached.slotInterval, cached.defaultCapacity));
          setCopyWeeks(0);
          setApplyMode("day");
          setLoadingDay(false);
          return;
        }
      } else {
        dayDetailCacheRef.current.delete(dateStr);
      }

      // Optimistic preview from monthSummary（避免下方面板空白）
      const preview = buildPreviewDayDetail(dateStr);
      if (preview) {
        setDayDetail(preview);
        setEditStatus(preview.status);
        setEditOpenTime(preview.openTime ?? "10:00");
        setEditCloseTime(preview.closeTime ?? "22:00");
        setEditReason(preview.reason ?? "");
        setEditInterval(preview.slotInterval);
        setEditCapacity(preview.defaultCapacity);
        setEditPeriods(editablePeriods(preview.periods, preview.slotInterval, preview.defaultCapacity));
        setCopyWeeks(0);
        setApplyMode("day");
      }
      setLoadingDay(true);

      try {
        const detail = await getDaySlotDetails(dateStr);
        // 慢回來的舊請求 — 使用者已經切到別的日期，丟掉結果
        if (requestId !== requestIdRef.current) return;
        dayDetailCacheRef.current.set(dateStr, detail);
        setDayDetail(detail);
        setEditStatus(detail.status);
        setEditOpenTime(detail.openTime ?? "10:00");
        setEditCloseTime(detail.closeTime ?? "22:00");
        setEditReason(detail.reason ?? "");
        setEditInterval(detail.slotInterval);
        setEditCapacity(detail.defaultCapacity);
        setEditPeriods(editablePeriods(detail.periods, detail.slotInterval, detail.defaultCapacity));
      } catch {
        if (requestId === requestIdRef.current) {
          toast.error("載入日期設定失敗");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoadingDay(false);
      }
    },
    [buildPreviewDayDetail, dayDraftDirty, selectedDate],
  );

  // ── 儲存日設定 ──
  const saveDay = useCallback(async () => {
    if (!selectedDate || !canManage || isPending || loadingDay || !periodValidation.valid) return;

    startTransition(async () => {
      try {
        const sortedPeriods = [...editPeriods].sort((a, b) => a.openTime.localeCompare(b.openTime));
        const firstPeriod = sortedPeriods[0];
        const lastPeriod = sortedPeriods.at(-1);
        // 「排班模板」模式 → 營業時間 + 時段開關一起複製到未來
        if (applyMode === "template" && dayDetail) {
          const isOpen = editStatus === "open" || editStatus === "custom";
          const result = await applyWeeklyTemplate({
            sourceDate: selectedDate,
            isOpen,
            openTime: isOpen ? firstPeriod?.openTime ?? editOpenTime : null,
            closeTime: isOpen ? lastPeriod?.closeTime ?? editCloseTime : null,
            slotInterval: editInterval,
            defaultCapacity: editCapacity,
            periods: isOpen ? sortedPeriods : undefined,
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
              periods: isOpen ? sortedPeriods : [],
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
            openTime: isOpen ? firstPeriod?.openTime ?? editOpenTime : null,
            closeTime: isOpen ? lastPeriod?.closeTime ?? editCloseTime : null,
            slotInterval: editInterval,
            defaultCapacity: editCapacity,
            periods: isOpen ? sortedPeriods : undefined,
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
              openTime: isOpen ? firstPeriod?.openTime ?? editOpenTime : null,
              closeTime: isOpen ? lastPeriod?.closeTime ?? editCloseTime : null,
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
              openTime: editStatus === "custom" ? firstPeriod?.openTime : undefined,
              closeTime: editStatus === "custom" ? lastPeriod?.closeTime : undefined,
              defaultCapacity: editStatus === "custom" ? editCapacity : undefined,
              periods: editStatus === "custom" ? sortedPeriods : undefined,
              resetSlotOverrides: true,
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
              openTime: editStatus === "custom" ? firstPeriod?.openTime : undefined,
              closeTime: editStatus === "custom" ? lastPeriod?.closeTime : undefined,
              defaultCapacity: editStatus === "custom" ? editCapacity : undefined,
              periods: editStatus === "custom" ? sortedPeriods : undefined,
              weeks: copyWeeks,
              resetSlotOverrides: editStatus === "custom",
            });
            if (copyResult.success) {
              toast.success(`已套用到未來 ${copyResult.data.count} 週`);
            }
          } else {
            toast.success("設定已儲存");
          }
        }

        // Day-detail cache 失效：
        //  - applyMode=day → 只清這一天（其他天的 detail 沒被影響）
        //  - copy / permanent / template → 多天或週規則被改，blast radius 大，清光
        if (applyMode === "day") {
          dayDetailCacheRef.current.delete(selectedDate);
        } else {
          dayDetailCacheRef.current.clear();
        }
        // 失效當月 cache 並重抓（其他月份保留 cache，不必清）
        await invalidateAndReloadCurrentMonth();
        await selectDate(selectedDate, { bypassCache: true });
        setReviewedDraft(null);
      } catch {
        toast.error("儲存失敗");
      }
    });
  }, [selectedDate, canManage, isPending, loadingDay, periodValidation.valid, editStatus, editReason, editOpenTime, editCloseTime, editInterval, editCapacity, editPeriods, applyMode, copyWeeks, templateWeeks, selectDate, dayDetail, invalidateAndReloadCurrentMonth]);

  // ── 儲存每週固定設定 ──
  const saveWeeklyDay = useCallback(async (
    dow: number, isOpen: boolean, periods: BusinessPeriod[],
  ) => {
    if (!canManage) return;
    startTransition(async () => {
      const sorted = [...periods].sort((a, b) => a.openTime.localeCompare(b.openTime));
      const first = sorted[0];
      const last = sorted.at(-1);
      const payload = {
        isOpen,
        openTime: isOpen ? first?.openTime ?? null : null,
        closeTime: isOpen ? last?.closeTime ?? null : null,
        slotInterval: first?.slotInterval ?? 60,
        defaultCapacity: first?.defaultCapacity ?? 6,
        periods: isOpen ? sorted : undefined,
      };

      const result = await updateBusinessHours(dow, payload);
      if (result.success) {
        toast.success("每週預設已更新");
        setWeeklyHours((prev) =>
          prev.map((w) => w.dayOfWeek === dow ? {
            ...w, isOpen,
            openTime: isOpen ? first?.openTime ?? null : null,
            closeTime: isOpen ? last?.closeTime ?? null : null,
            slotInterval: first?.slotInterval ?? 60,
            defaultCapacity: first?.defaultCapacity ?? 6,
            periods: isOpen ? sorted : [],
          } : w)
        );
        // 每週規則改動會影響所有同 dow 的日期 → blast radius 是整個 cache
        dayDetailCacheRef.current.clear();
        // 失效當月 cache 並重抓（每週規則改動會反映到本月所有同 dow 的日期）
        await invalidateAndReloadCurrentMonth();
        if (selectedDate) {
          await selectDate(selectedDate, { bypassCache: true });
        }
      } else {
        toast.error(result.error);
      }
    });
  }, [canManage, selectedDate, selectDate, invalidateAndReloadCurrentMonth]);

  // ── 渲染 ──
  // ── 同步總部設定 ──
  const [syncing, setSyncing] = useState(false);
  const handleSync = useCallback(async () => {
    if (!confirm("確定要套用總部的營業時間與時段設定？\n\n此操作會清除本店目前的設定，並從總部重新複製。")) return;
    setSyncing(true);
    try {
      const result = await syncFromHeadquarters();
      if (result.success) {
        toast.success(`已套用總部設定（${result.data.businessHours} 筆營業時間、${result.data.bookingSlots} 筆時段）`);
        window.location.reload();
      } else {
        toast.error(result.error || "同步失敗");
      }
    } catch {
      toast.error("同步失敗");
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(400px,0.8fr)]">
      {/* ===== 左側：月曆 ===== */}
      <div className="space-y-4">
        {/* 套用總部設定（僅非總部店顯示） */}
        {canManage && !isHeadquarters && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">同步總部設定</p>
                <p className="text-xs text-amber-600">清除本店設定，套用總部的營業時間與時段</p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {syncing ? "同步中..." : "套用總部設定"}
              </button>
            </div>
          </div>
        )}

        <div className="relative rounded-xl border bg-white p-4 shadow-sm">
          {/* 月份切換 — loading 時 disable 防止快速連點造成 race */}
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => changeMonth(-1)}
              disabled={isMonthLoading}
              className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              ← 上月
            </button>
            <h2 className="text-base font-bold text-earth-900">{year} 年 {month} 月</h2>
            <button
              onClick={() => changeMonth(1)}
              disabled={isMonthLoading}
              className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              下月 →
            </button>
          </div>

          {/* 圖例 */}
          <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-earth-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-200" /> 正常營業</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-earth-300" /> 公休</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-200" /> 進修</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-200" /> 特殊時段</span>
          </div>

          {/* 日曆格子 — key 含 year/month，切月份時 React 重新掛載觸發
              CSS transition；loading 時降低 opacity，給輕微淡入效果。 */}
          <div
            key={`cal-${year}-${month}`}
            className={`grid grid-cols-7 gap-1 transition duration-200 ${
              isMonthLoading
                ? "translate-y-1 opacity-60 motion-reduce:translate-y-0"
                : "translate-y-0 opacity-100"
            }`}
          >
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

          {/* Loading overlay — 月曆保留高度，淡淡浮層 + 文字，不白屏 */}
          {isMonthLoading && (
            <div
              className="pointer-events-none absolute inset-x-4 top-12 flex justify-center"
              role="status"
              aria-live="polite"
            >
              <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-earth-600 shadow ring-1 ring-earth-200">
                載入月份資料中…
              </span>
            </div>
          )}
        </div>

        {/* ===== 每週固定規則（可摺疊）===== */}
        <div className="rounded-xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowWeekly(!showWeekly)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <h3 className="text-sm font-semibold text-earth-800">每週固定服務時間</h3>
            <svg className={`h-4 w-4 text-earth-400 transition ${showWeekly ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showWeekly && (
            <div className="border-t px-4 pb-4">
              <p className="mb-3 pt-3 text-xs text-green-700">✓ 設定一次永久套用，每週自動循環，不需每月重新設定</p>
              <div className="space-y-2">
                {weeklyHours.map((w) => (
                  <WeeklyDayRow
                    key={w.dayOfWeek}
                    day={w}
                    canManage={canManage}
                    isPending={isPending}
                    isSpaStore={isSpaStore}
                    onSave={saveWeeklyDay}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== 右側：日設定面板 =====
          有 dayDetail（可能是 cache hit、preview 或 server-fetched 完整版）就直接 render；
          loadingDay 不再 short-circuit 整面成 spinner — slot 區自己用 skeleton 撐版面，
          上半部用 monthSummary 預覽資訊立即顯示，店長不會看到空白。
          fallback：preview 也組不出來時（極少見）才走全 spinner。 */}
      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        {!selectedDate ? (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-center text-sm text-earth-400">← 點選月曆上的日期來檢視或設定</p>
          </div>
        ) : !dayDetail && loadingDay ? (
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

              <p className="mb-3 text-[11px] text-earth-500">
                選日期 → 調整時間 → 檢查開放時段 → 確認儲存
              </p>

              <section className="mb-4 rounded-lg border border-primary-100 bg-primary-50 p-3" aria-label="目前已儲存的時段">
                <h4 className="text-sm font-semibold text-primary-800">目前開放時段</h4>
                {loadingDay ? <p className="mt-2 text-xs" role="status">讀取當日時段中…</p> : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dayDetail.slots.filter((slot) => slot.isEnabled).map((slot) => (
                        <span key={slot.startTime} className="rounded-md border border-primary-200 bg-white px-2 py-1 text-sm text-primary-800">{slot.startTime}<span className="ml-1 text-xs text-earth-500">{slot.capacity} 位</span></span>
                      ))}
                    </div>
                    {!currentTimes.size && <p className="mt-2 text-sm text-earth-500">目前沒有開放時段</p>}
                    <p className="mt-2 text-xs text-earth-500">這是已儲存的安排；下方調整需確認儲存才會生效。</p>
                  </>
                )}
              </section>

              <fieldset disabled={isPending || loadingDay} className="min-w-0">
              {/* 狀態選擇 */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-earth-600">當日狀態</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { value: "open", label: "照常營業", color: "bg-green-100 text-green-700 ring-green-400" },
                    { value: "closed", label: "全天休息", color: "bg-earth-100 text-earth-600 ring-earth-400" },
                    { value: "training", label: "教育訓練", color: "bg-red-100 text-red-600 ring-red-400" },
                    { value: "custom", label: "調整時間", color: "bg-blue-100 text-blue-700 ring-blue-400" },
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
                <div className="mb-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-900">今天開放哪些時間？</p>
                    <p className="mt-0.5 text-[11px] text-blue-700">中間沒有設定的時間會自動視為休息，不必逐格關閉。</p>
                  </div>
                  {editPeriods.map((period, index) => (
                    <div key={index} className="rounded-lg border border-blue-100 bg-white p-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-earth-700">服務時間 {index + 1}</span>
                        {editPeriods.length > 1 && (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => setEditPeriods((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                            className="text-[11px] text-red-600 hover:text-red-700"
                          >
                            移除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="text-[11px] text-earth-500">
                          開始
                          <input type="time" value={period.openTime} disabled={!canManage}
                            onChange={(e) => setEditPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, openTime: e.target.value } : item))}
                            className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-xs" />
                        </label>
                        <label className="text-[11px] text-earth-500">
                          結束
                          <input type="time" value={period.closeTime} disabled={!canManage}
                            onChange={(e) => setEditPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, closeTime: e.target.value } : item))}
                            className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-xs" />
                        </label>
                        <label className="text-[11px] text-earth-500">
                          預約時段間隔
                          <select value={period.slotInterval} disabled={!canManage}
                            onChange={(e) => setEditPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, slotInterval: Number(e.target.value) } : item))}
                            className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-xs">
                            {intervalOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value} 分鐘</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] text-earth-500">
                          每時段名額
                          <select value={period.defaultCapacity} disabled={!canManage}
                            onChange={(e) => setEditPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, defaultCapacity: Number(e.target.value) } : item))}
                            className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-xs">
                            {CAPACITY_OPTIONS.map((c) => <option key={c} value={c}>{c} 位</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!canManage || editPeriods.length >= 8}
                    onClick={() => setEditPeriods((items) => [...items, { openTime: "14:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: editCapacity }])}
                    className="w-full rounded-lg border border-dashed border-blue-300 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    ＋ 新增一段服務時間
                  </button>
                  {editStatus === "custom" && draftSlotPreview.length > 0 && (
                    <div className="rounded-lg border border-blue-100 bg-white px-2.5 py-2">
                      <p className="text-sm font-medium text-earth-700">調整後的預約開始時間</p>
                      {!periodValidation.valid ? <p role="alert" className="mt-2 text-sm text-red-700">{periodValidation.error}</p> : <div className="mt-2 flex flex-wrap gap-2">
                        {draftSlotPreview.map((slot) => <span key={slot.startTime} className="rounded-md border border-primary-200 bg-primary-50 px-2 py-1 text-sm text-primary-800">{slot.startTime} <span className="text-xs">{slot.capacity} 位</span></span>)}
                      </div>}
                      <p className="mt-2 text-xs text-earth-500">間隔決定幾點可預約，不會改變每位顧客的服務長度。</p>
                    </div>
                  )}
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
                          onChange={() => { setApplyMode("copy"); setCopyWeeks((weeks) => weeks || 2); }}
                          className="accent-primary-600"
                        />
                        複製到未來
                        <select
                          value={copyWeeks || 2}
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
                            更新每週{dayDetail?.dayName}固定服務時間
                            <span className="ml-1 text-[10px] text-earth-400">不會覆蓋其他日期的特殊設定</span>
                          </span>
                        </label>
                        {showAdvancedSlots && (
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
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 儲存 / 回復按鈕 */}
              {canManage && (
                <div>
                  {!periodValidation.valid && <p role="alert" className="mb-2 text-sm text-red-700">{periodValidation.error}</p>}
                  {reviewing && (
                    <section aria-label="儲存前確認" className="mb-3 space-y-2 rounded-lg border border-primary-300 bg-primary-50 p-3 text-sm">
                      <h4 className="font-bold text-primary-900">請確認這次調整</h4>
                      <p className="font-medium">{scopeLabel}</p>
                      {editStatus === "custom" && (applyMode === "day" || applyMode === "copy") ? <>
                        <p>服務時間：{editPeriods.map((period) => `${period.openTime}–${period.closeTime}`).join("、")}</p>
                        <p>新增開放：{addedTimes.join("、") || "無"}</p>
                        <p>停止開放：{removedTimes.join("、") || "無"}</p>
                        <p className="text-xs text-amber-800">重新設定服務時間會清除套用日期原有的臨時時段調整，以上方預覽為準。</p>
                      </> : <p>{editStatus === "closed" || editStatus === "training" ? "全天停止接受新預約。" : applyMode === "day" ? "使用每週固定服務時間；當日單格時段調整仍保留。" : `固定服務時間：${editPeriods.map((period) => `${period.openTime}–${period.closeTime}`).join("、")}。各日期的特殊設定與時段調整依既有套用規則處理。`}</p>}
                      {applyMode !== "day" && <p className="text-xs text-amber-800">這次不只影響一天，請再次確認套用範圍。</p>}
                      <p className="text-xs text-earth-600">既有預約不會自動取消，收款與扣堂不會變動；如無法服務，請另行聯繫顧客。</p>
                      <button type="button" disabled={isPending} onClick={() => setReviewedDraft(null)} className="underline text-primary-800">返回修改</button>
                    </section>
                  )}
                  {dayDraftDirty && <p className="mb-2 text-xs font-medium text-amber-700">尚未儲存：先確認預覽與套用範圍，再儲存。</p>}
                  <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { if (reviewing) void saveDay(); else setReviewedDraft(draftKey); }}
                    disabled={isPending || loadingDay || !dayDraftDirty || !periodValidation.valid}
                    className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {isPending ? "儲存中..." : reviewing ? "確認並儲存" : "檢查變更"}
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
                </div>
              )}
              </fieldset>
            </div>

            {/* 單一時段微調屬於進階功能，預設收合，避免成為店長的主要操作流程。 */}
            <div className="rounded-xl border bg-white shadow-sm">
              <button
                type="button"
                aria-expanded={showAdvancedSlots}
                onClick={() => {
                  setShowAdvancedSlots((shown) => {
                    if (shown && applyMode === "template") setApplyMode("day");
                    return !shown;
                  });
                }}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold text-earth-700">進階：單一時段微調</span>
                  <span className="mt-0.5 block text-[11px] text-earth-400">
                    僅供設定頁調整單格名額；開關請從預約管理的「管理時段」草稿操作
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-earth-500">
                  {dayDetail.slots.filter((slot) => slot.override).length > 0 && (
                    <span className="mr-2 text-amber-600">
                      {dayDetail.slots.filter((slot) => slot.override).length} 個微調
                    </span>
                  )}
                  {showAdvancedSlots ? "收合" : "展開"}
                </span>
              </button>
              {showAdvancedSlots && (
              <div className="border-t px-4 pb-4 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-earth-700">單一時段開放與名額</h4>
                {loadingDay && dayDetail.slots.length === 0 ? (
                  <span className="text-[10px] text-earth-400">載入中…</span>
                ) : canManage && dayDetail.slots.length > 0 && editStatus !== "closed" && editStatus !== "training" ? (
                  <span className="text-[10px] text-earth-400">名額調整請點選時段</span>
                ) : null}
              </div>
              {editStatus === "closed" || editStatus === "training" ? (
                <p className="py-4 text-center text-sm text-earth-400">
                  {editStatus === "closed" ? "店休日 — 不開放預約" : "進修日 — 不開放預約"}
                </p>
              ) : loadingDay && dayDetail.slots.length === 0 ? (
                // Skeleton：用 monthSummary[date].slotCount 撐出對的格數，
                // 避免店長看到「此日尚未設定...」誤以為真的空。
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({
                    length: Math.max(
                      1,
                      monthSummary[selectedDate]?.slotCount ?? 9,
                    ),
                  }).map((_, i) => (
                    <div
                      key={i}
                      className="h-7 animate-pulse rounded-lg bg-earth-100"
                    />
                  ))}
                </div>
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
                        editStatus={editStatus}
                        editOpenTime={editOpenTime}
                        editCloseTime={editCloseTime}
                        canManage={canManage}
                        isSelected={selectedSlot === s.startTime}
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
                                await Promise.all([
                                  selectDate(selectedDate, { bypassCache: true }),
                                  invalidateAndReloadCurrentMonth(),
                                ]);
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
                                  await Promise.all([
                                    selectDate(selectedDate, { bypassCache: true }),
                                    invalidateAndReloadCurrentMonth(),
                                  ]);
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
                  ⚡ 有手動覆寫的時段（黃框 = 強制開放，紅框 = 手動關閉；點選時段可調整名額）
                </p>
              )}
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
  isSpaStore,
  onSave,
}: {
  day: WeeklyHour;
  canManage: boolean;
  isPending: boolean;
  isSpaStore: boolean;
  onSave: (dow: number, isOpen: boolean, periods: BusinessPeriod[]) => void;
}) {
  const intervalOptions = isSpaStore
    ? SLOT_INTERVAL_OPTIONS.filter((option) => option.value === 15 || option.value === 30)
    : SLOT_INTERVAL_OPTIONS.filter((option) => option.value !== 15);
  const [isOpen, setIsOpen] = useState(day.isOpen);
  const [periods, setPeriods] = useState<BusinessPeriod[]>(day.periods?.length ? day.periods : [{
    openTime: day.openTime ?? "10:00",
    closeTime: day.closeTime ?? "22:00",
    slotInterval: day.slotInterval ?? 60,
    defaultCapacity: day.defaultCapacity ?? 6,
  }]);
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
            <span className="text-xs text-earth-600">
              {periods.map((period) => `${period.openTime}～${period.closeTime}`).join("、")}
            </span>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="ml-auto text-[10px] text-earth-400 hover:text-earth-600"
              title="調整每週固定服務時間"
            >
              {expanded ? "收合 ▲" : "調整 ▼"}
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
              onSave(day.dayOfWeek, isOpen, periods);
              setDirty(false);
            }}
            className={`${isOpen && !expanded ? "" : "ml-auto"} shrink-0 rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-60`}
          >
            儲存
          </button>
        )}
      </div>

      {/* 展開的多區段設定 */}
      {isOpen && expanded && (
        <div className="mt-2 space-y-2 border-t border-earth-200 pt-2">
          <p className="text-[10px] text-earth-500">中間未設定的時間會自動視為休息。</p>
          {periods.map((period, index) => (
            <div key={index} className="grid grid-cols-2 gap-1.5 rounded border border-earth-200 bg-white p-2 sm:grid-cols-4">
              <input type="time" value={period.openTime} disabled={!canManage} className="rounded border px-1 py-1 text-[11px]"
                onChange={(e) => { setPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, openTime: e.target.value } : item)); setDirty(true); }} />
              <input type="time" value={period.closeTime} disabled={!canManage} className="rounded border px-1 py-1 text-[11px]"
                onChange={(e) => { setPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, closeTime: e.target.value } : item)); setDirty(true); }} />
              <select value={period.slotInterval} disabled={!canManage} className="rounded border px-1 py-1 text-[11px]"
                onChange={(e) => { setPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, slotInterval: Number(e.target.value) } : item)); setDirty(true); }}>
                {intervalOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}分鐘</option>)}
              </select>
              <div className="flex gap-1">
                <select value={period.defaultCapacity} disabled={!canManage} className="min-w-0 flex-1 rounded border px-1 py-1 text-[11px]"
                  onChange={(e) => { setPeriods((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, defaultCapacity: Number(e.target.value) } : item)); setDirty(true); }}>
                  {CAPACITY_OPTIONS.map((capacity) => <option key={capacity} value={capacity}>{capacity}位</option>)}
                </select>
                {periods.length > 1 && <button type="button" className="text-[10px] text-red-600" onClick={() => { setPeriods((items) => items.filter((_, itemIndex) => itemIndex !== index)); setDirty(true); }}>刪除</button>}
              </div>
            </div>
          ))}
          <button type="button" disabled={!canManage || periods.length >= 8}
            onClick={() => { setPeriods((items) => [...items, { openTime: "14:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: day.defaultCapacity }]); setDirty(true); }}
            className="w-full rounded border border-dashed border-earth-300 py-1.5 text-[11px] text-earth-600">
            ＋ 增加營業時段
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 時段名額選取按鈕；開關與新增時段統一由預約管理的「管理時段」處理。
// ============================================================

function SlotToggleButton({
  slot,
  editStatus,
  editOpenTime,
  editCloseTime,
  canManage,
  isSelected,
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
  editStatus: string;
  editOpenTime: string;
  editCloseTime: string;
  canManage: boolean;
  isSelected: boolean;
  onSelect: (startTime: string) => void;
}) {
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

  // 樣式：根據狀態和 override 類型決定
  let className = "rounded-lg px-2 py-1.5 text-center text-xs font-medium transition ";
  if (slot.override === "disabled") {
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
      onClick={() => onSelect(slot.startTime)}
      disabled={!canManage}
      className={className}
      title={
        slot.override === "disabled"
          ? `手動關閉${slot.overrideReason ? `：${slot.overrideReason}` : ""}（請在預約管理的「管理時段」重新開放）`
          : slot.override === "enabled"
            ? `強制開放${slot.overrideReason ? `：${slot.overrideReason}` : ""}（請在預約管理的「管理時段」調整）`
            : isActive
              ? `${slot.startTime}（${slot.capacity}位）— 點選調整名額`
              : `${slot.startTime}（目前未開放）`
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
