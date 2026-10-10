"use client";
import { readBookingDetail as fetchBookingDetail, updateBookingStatus, markBookingNoShow, collectBookingTrialPayment, correctBookingTrialCollection } from "@/lib/booking-client-transport";

import { LoadingStatus } from "@/components/loading-status";
import { BookingGuideContext } from "@/components/operation-guide-shell";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useResponsiveAction } from "@/hooks/use-responsive-action";
import { bookingMatchesExpectation, type BookingActionExpectation } from "@/lib/booking-action-reconciliation";
import { BookingActionFeedback } from "./booking-action-feedback";
import { toast } from "sonner";
import { CustomerPageLink as Link } from "@/components/customer-page-link";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  StatusBadge,
  bookingStatusMeta,
} from "@/components/admin/status-badge";
import {
  type BookingDrawerPayload,
} from "@/server/actions/booking-drawer";
import type { BookingNotePatch } from "./booking-note-state";
import type { BookingDetailCache } from "./booking-detail-cache";
import {
  cancelBooking,
  updateBooking,
} from "@/server/actions/booking";
import { BookingNoteEditor } from "./booking-note-editor";
import { BookingServiceNoteEditor } from "./booking-service-note-editor";
import { BookingCompanionEditor } from "./booking-companion-editor";
import { BookingParticipantCheckout } from "./booking-participant-checkout";
import { NoShowModal, type NoShowChoice } from "./no-show-modal";
import { RescheduleModal } from "./reschedule-modal";
import { CollectTrialModal } from "./collect-trial-modal";
import { CorrectTrialCollectionModal } from "./correct-trial-collection-modal";
import { AttendanceModal } from "./attendance-modal";
import { CollectSingleModal } from "./collect-single-modal";
import { AdjustCheckoutModal } from "./adjust-checkout-modal";
import { OperationHistoryButton } from "@/components/operation-history-button";
import { computeAmount, resolveTrialDisplayAmount } from "./compute-amount";
import { PeopleBadge } from "./people-badge";
import { packageUsageSummary } from "./package-usage-summary";
import { bookingPlanExpiry } from "@/lib/booking-plan-expiry";
import { trialBookingSourceLabel } from "@/lib/trial-booking-source";
import { formatWeekdayZh } from "@/lib/date-utils";

/** Keep pending and loaded content in the same independently flowing columns. */
function DetailBody({ spaMode = false, busy, appointment, customer, payment, notes }: {
  spaMode?: boolean;
  busy?: boolean;
  appointment: React.ReactNode;
  customer: React.ReactNode;
  payment: React.ReactNode;
  notes?: React.ReactNode;
}) {
  if (spaMode) return <div className="flex-1 overflow-y-auto">{appointment}{customer}{payment}{notes}</div>;
  return (
    <div aria-busy={busy} className="grid min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto md:grid-cols-2 md:items-start">
      <div className="min-w-0">{appointment}{payment}</div>
      <div className="min-w-0 md:border-l md:border-earth-100">{customer}{notes}</div>
    </div>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
  STORED_VALUE: "儲值金",
};

/**
 * Lightweight booking handle that the calendar / day panel passes to the
 * drawer the moment it's clicked. Lets the drawer render its header band
 * (status badge, date+time, customer name, plan label, duration) **before**
 * the round-trip to `fetchBookingDetail()` completes — so the user perceives
 * the drawer as instant.
 *
 * Keep this in sync with the small subset that calendar / day panel already
 * have in memory. **Do not** add fields here that require an extra query.
 */
export interface BookingSummary {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  slotTime: string;
  bookingStatus: string;
  isMakeup: boolean;
  people: number;
  customerName: string;
  servicePlanName?: string | null;
  servicePlanCategory?: string | null;
}

/**
 * 較完整的「當日清單已有資料」快照（PR-Frontend prefill）。比 BookingSummary
 * 多帶足以**立即**渲染抽屜 body 基本區塊（預約資訊 + 顧客 + 收款提示）的欄位，
 * 全部來自 monthData / BookingEntry，**不需任何額外查詢**。
 *
 * 用途：點「查看」後 body 立刻顯示已知資料，而非一片 skeleton。
 * 單人方案／已收款預約可提前送出完成服務，由 server 再核對權限與扣堂。
 * 多人、收款、改期、取消與調整結帳仍等完整明細。
 */
export interface BookingPrefill {
  id: string;
  customerId?: string;
  bookingDate: string; // YYYY-MM-DD
  slotTime: string;
  bookingStatus: string;
  bookingType: string;
  isMakeup: boolean;
  isCheckedIn: boolean;
  people: number;
  /** 實際到店人數（多人首次體驗或套餐；null = 未記錄／全到）。 */
  attendedPeople: number | null;
  customerName: string;
  customerPhone: string;
  /** 內部服務備註（後台限定）— prefill 即可即時顯示。 */
  serviceNote: string | null;
  revenueStaff: { displayName: string; colorCode: string } | null;
  serviceStaffName: string | null;
  servicePlanName: string | null;
  /** 收款提示（唯讀）：來自當日清單 derived 欄位。 */
  collected: boolean;
  collectedAmount: number | null;
  expectedAmount: number | null;
  trialDefaultPrice: number | null;
  /** 已由月曆查詢取得的方案快照；僅供完整明細回來前唯讀顯示。 */
  customerPlanWallet?: {
    status: string;
    remainingSessions: number;
    expiryDate: Date | string | null;
    planName: string;
  } | null;
  /** 已完成預約的實際扣堂方案名稱；空陣列代表月曆摘要沒有扣堂紀錄。 */
  deductedPlanNames?: string[];
}

interface BookingDetailDrawerProps {
  /** A roster shortcut opens the existing payment flow after authoritative detail loads. */
  initialIntent?: "collect";
  sharedActions?: ReturnType<typeof useResponsiveAction>;
  operationGuidePreview?: boolean;
  open: boolean;
  bookingId: string | null;
  resolvedStoreId?: string;
  /** Pre-loaded summary from calendar / day panel — used for instant header render. */
  summary?: BookingSummary | null;
  /**
   * Richer in-memory snapshot from the day list — lets the drawer body render
   * its basic sections instantly (no fetch). Read-only display only.
   */
  prefill?: BookingPrefill | null;
  /**
   * Shared client-side detail cache (owned by the parent so it survives
   * open/close and can be invalidated after mutations). Enables SWR + dedupe.
   */
  cache?: BookingDetailCache;
  onClose: () => void;
  /**
   * Called after a successful drawer action.
   * `newStatus` is the server-confirmed next state — parent uses it to update
   * cached month / day data without refetching the whole month.
   */
  onUpdated?: (bookingId: string, newStatus: string | null) => void;
  onNotesUpdated?: (patch: BookingNotePatch) => void;
  readOnly?: boolean;
  /** Optional prefilled "book this customer again" destination. */
  rebookHref?: string;
  /** Industry-specific service duration when the core Booking row has no duration column. */
  durationMinutes?: number;
  /** SPA Demo uses one unified on-site checkout flow. */
  spaMode?: boolean;
}

export function BookingDetailDrawer({
  initialIntent,
  sharedActions,
  operationGuidePreview = false,
  open,
  bookingId,
  resolvedStoreId,
  summary,
  prefill,
  cache,
  onClose,
  onUpdated,
  onNotesUpdated,
  readOnly = false,
  rebookHref,
  durationMinutes,
  spaMode = false,
}: BookingDetailDrawerProps) {
  const collectionIntentHandled=useRef<string|null>(null);
  const [data, setData] = useState<BookingDrawerPayload | null>(null);
  const [prefillStatus, setPrefillStatus] = useState<string | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const localActions = useResponsiveAction();
  const saves = sharedActions ?? localActions;
  const currentBooking = useRef(bookingId);
  useLayoutEffect(() => { currentBooking.current = bookingId; }, [bookingId]);
  const actionKey = bookingId ?? "";
  const actionState = saves.states[actionKey];
  const [participantBusy, setParticipantBusy] = useState(false);
  const isActing = saves.isBlocked(actionKey) || participantBusy;
  const checkingResult = actionState?.phase === "checking" || actionState?.phase === "unknown";
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [partialAttendedPeople, setPartialAttendedPeople] = useState<
    number | null
  >(null);
  // 實際到店人數 modal — 多人首次體驗或套餐預約。
  // flow pivot：可由「收款」或「完成服務」入口觸發；以 intent 分流：
  //   - "collect" + N≥1 → 開 CollectTrialModal（attendedPeople 透過
  //     pendingAttendedPeople 帶入，收款 server 端同 transaction 寫 DB）
  //   - "collect" + 0     → markNoShow
  //   - "complete" + N≥1 → markCompleted({ attendedPeople: N })
  //   - "complete" + 0   → markNoShow
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceIntent, setAttendanceIntent] = useState<
    "collect" | "complete" | null
  >(null);
  // 暫存「收款入口先勾選的實到人數」，待 CollectTrialModal 收款成功時連同
  // server transaction 一併寫 DB；取消收款 / 切換預約 → 清空，避免髒資料。
  const [pendingAttendedPeople, setPendingAttendedPeople] = useState<
    number | null
  >(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [collectSingleOpen, setCollectSingleOpen] = useState(false);
  const [adjustCheckoutOpen, setAdjustCheckoutOpen] = useState(false);
  const [adjustToSingleOpen, setAdjustToSingleOpen] = useState(false);
  // 收款 / 更正成功後預約狀態不變、但 trial.collected 會翻轉 → 用 nonce 觸發重抓
  const [reloadNonce, setReloadNonce] = useState(0);
  // 記錄 `data` 上次 seed 的 bookingId — 讓我們能在 render 期（而非 effect 內）
  // 依「開啟的 booking 改變」從 cache 直接 seed，避免 effect 同步 setState。
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // B：開啟的 booking 改變時，於 render 期從 cache seed `data`（React 官方
  // 「依 prop 變化調整 state」模式，非 effect）。cache hit → 第一個 frame 就
  // 顯示完整 payload（含操作），無 skeleton；cache miss → null → 走 prefill。
  // 由 seededFor 守門，每個 id 只 seed 一次，不會無限迴圈。
  // flow pivot：切換 booking 時順手清掉 AttendanceModal 的暫存實到人數，
  // 避免上一筆未收款的選擇被帶到下一筆。
  if (open && bookingId && seededFor !== bookingId) {
    setSeededFor(bookingId);
    setPrefillStatus(null);
    setPendingBalance(null);
    setData(cache?.get(bookingId) ?? null);
    setError(null);
    setPendingAttendedPeople(null);
    setPartialAttendedPeople(null);
    setNoShowOpen(false);
    setAttendanceOpen(false);
    setAttendanceIntent(null);
    setRescheduleOpen(false);
    setCollectOpen(false);
    setCorrectOpen(false);
    setCollectSingleOpen(false);
    setAdjustCheckoutOpen(false);
    setAdjustToSingleOpen(false);
  }

  // Derived loading state — `data` is "fresh" when its bookingId matches the
  // currently open one.
  const dataMatches = !!data && data.booking.id === bookingId;
  const loading = !!bookingId && !error && !dataMatches;

  // 背景 revalidate（純非同步，無同步 setState）。每次 open / id 變 / reloadNonce
  // bump（mutation 後）都 dedupe-load authoritative payload 後寫入。cleanup 的
  // `canceled` 會丟掉「被更新後的 run（如 mutation reloadNonce）取代」的舊回應，
  // 避免過期 revalidate 蓋掉 optimistic 結果。
  useEffect(() => {
    if (!open || !initialIntent) collectionIntentHandled.current=null;
    if (!open || !bookingId || isActing) return;
    const id = bookingId;
    let canceled = false;
    const promise = cache ? cache.load(id) : fetchBookingDetail(id, resolvedStoreId);
    promise
      .then((payload) => {
        if (canceled) return;
        setData(payload);
        setPendingBalance(null);
        setError(null);
        // Only route the explicit shortcut; never collect or complete without confirmation.
        if(initialIntent === "collect" && !readOnly && collectionIntentHandled.current !== id && payload.booking.id === id) {
          collectionIntentHandled.current=id;
          const b=payload.booking;
          if(!payload.participantCheckout && (b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED")) {
            if(b.bookingType === "FIRST_TRIAL" && payload.trial && !payload.trial.collected) {
              if(b.people>1 && b.attendedPeople==null) {setAttendanceIntent("collect");setAttendanceOpen(true);}
              else setCollectOpen(true);
            } else if(b.bookingType === "SINGLE" && payload.single && !payload.single.collected) setCollectSingleOpen(true);
          }
        }
      })
      .catch((e) => {
        if (canceled) return;
        // 已有可顯示資料（cache）時，背景 revalidate 失敗不蓋畫面；否則才顯示錯誤。
        if (!cache?.get(id)) {
          console.error("booking detail load failed", e);
          setError("預約資料暫時無法完整載入，請稍後再試，或開啟完整頁面查看。");
        }
      });
    return () => {
      canceled = true;
    };
  }, [open, bookingId, reloadNonce, cache, resolvedStoreId, isActing, initialIntent, readOnly]);

  /** Only an unambiguous single-person package deduction is projected locally. */
  function wrapAction(
    label: string,
    action: () => Promise<{ success: boolean; error?: string } | unknown>,
    nextStatus: string | null,
    opts?: {
      onSuccess?: () => void;
      expected?: BookingActionExpectation;
      optimistic?: boolean;
      onOptimistic?: () => void;
      onRollback?: () => void;
    },
  ) {
    if (!bookingId) return;
    if (readOnly) { toast.error("查看模式下不可操作預約"); return; }
    const id = bookingId;
    let recoveredPayload: BookingDrawerPayload | null = null;
    const originalData = data?.booking.id === id ? data : null;
    const originalStatus = originalData?.booking.bookingStatus ?? (prefill?.id === id ? prefill.bookingStatus : null);
    const optimisticStatus = opts?.optimistic && nextStatus ? nextStatus : null;
    const source = originalData?.booking ?? (prefill?.id === id ? prefill : null);
    const wallet = source?.customerPlanWallet;
    const projectedBalance = !spaMode && optimisticStatus === "COMPLETED" &&
      source && ["PENDING", "CONFIRMED"].includes(source.bookingStatus) &&
      source.bookingType === "PACKAGE_SESSION" && source.people === 1 && !source.isMakeup &&
      (!originalData || originalData.booking.makeupCreditLinks.length === 0) &&
      wallet && wallet.remainingSessions > 0
      ? wallet.remainingSessions - 1 : null;
    const expected = { ...(nextStatus ? { status: nextStatus } : {}), ...opts?.expected };
    void saves.run(id, async () => {
      const result = await action() as { success?: boolean; error?: string } | undefined;
      if (typeof result?.success !== "boolean") throw new Error("結果待確認");
      if (!result.success) toast.error(result.error ?? "操作未完成");
      return { success: result.success, error: result.error };
    }, {
      timingLabel: !spaMode && opts?.optimistic
        ? nextStatus === "COMPLETED" ? "complete" : nextStatus === "PENDING" ? "revert" : undefined
        : undefined,
      apply: () => {
        if (!optimisticStatus) return;
        onUpdated?.(id, optimisticStatus);
        if (currentBooking.current !== id) return;
        setPrefillStatus(optimisticStatus);
        setPendingBalance(projectedBalance);
        setData(previous =>
          previous?.booking.id === id ? { ...previous, booking: {
            ...previous.booking,
            bookingStatus: optimisticStatus,
            isCheckedIn: optimisticStatus === "COMPLETED"
              ? true
              : optimisticStatus === "PENDING"
                ? false
                : previous.booking.isCheckedIn,
          } } : previous);
        opts?.onOptimistic?.();
      },
      rollback: () => {
        if (!optimisticStatus) return;
        if (originalStatus) onUpdated?.(id, originalStatus);
        if (currentBooking.current !== id) return;
        setPrefillStatus(null);
        setPendingBalance(null);
        if (originalData) setData(originalData);
        opts?.onRollback?.();
      },
      reconcile: async signal => {
        const payload = await fetchBookingDetail(id, resolvedStoreId);
        if (signal.aborted || !bookingMatchesExpectation(payload.booking, id, expected)) return false;
        recoveredPayload = payload;
        return true;
      },
      recovered: () => {
        if (!recoveredPayload) return;
        cache?.invalidate(id);
        onUpdated?.(id, nextStatus);
        if (currentBooking.current !== id) return;
        setData(recoveredPayload);
        setPendingBalance(null);
        setError(null);
        opts?.onSuccess?.();
      },
      confirmed: () => {
        toast.success(label);
        if (!optimisticStatus) onUpdated?.(id, nextStatus);
        cache?.invalidate(id);
        // A late completion must not close B's modal or change B's status.
        if (currentBooking.current !== id) return;
        opts?.onSuccess?.();
        if (nextStatus) setData(previous =>
          previous?.booking.id === id ? { ...previous, booking: {
            ...previous.booking,
            bookingStatus: nextStatus,
            isCheckedIn: nextStatus === "COMPLETED" ? true : nextStatus === "PENDING" ? false : previous.booking.isCheckedIn,
          } } : previous);
        setReloadNonce(n => n + 1);
      },
    });
  }

  // 收款入口（flow pivot）：FIRST_TRIAL + people > 1 + 尚未確認實到人數 →
  // 先問 AttendanceModal（intent="collect"）；其餘狀況直接開 CollectTrialModal。
  // people=1 或已存 attendedPeople（如 完成服務 fallback 已寫入後再點收款）→
  // 不重問，直接收款。
  function handleCollect() {
    const b = data?.booking;
    if (readOnly || data?.participantCheckout) return;
    if (
      b &&
      b.bookingType === "FIRST_TRIAL" &&
      b.people > 1 &&
      b.attendedPeople == null
    ) {
      setAttendanceIntent("collect");
      setAttendanceOpen(true);
      return;
    }
    setCollectOpen(true);
  }

  // 完成服務入口：多人首次體驗與套餐都先確認實到人數。
  function handleComplete() {
    const b = dataMatches ? data?.booking : prefill?.id === bookingId ? prefill : null;
    if (readOnly || (dataMatches && data?.participantCheckout)) return;
    if (
      b &&
      (b.bookingType === "FIRST_TRIAL" ||
        b.bookingType === "PACKAGE_SESSION") &&
      b.people > 1 &&
      b.attendedPeople == null &&
      (b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED")
    ) {
      setAttendanceIntent("complete");
      setAttendanceOpen(true);
      return;
    }
    wrapAction("已完成服務", () => updateBookingStatus(bookingId!, "complete"), "COMPLETED", {
      optimistic: true,
    });
  }

  // AttendanceModal confirm — 依 attendanceIntent 分流。
  //   intent="collect"：0 → markNoShow；N≥1 → 暫存 pendingAttendedPeople 並開 CollectTrialModal
  //   intent="complete"：0 → markNoShow；N≥1 → markCompleted({attendedPeople:N})
  // 不論成功失敗都關閉 AttendanceModal；intent 在分流後即可清空。
  function handleAttendanceConfirm(attendedPeople: number) {
    if (!bookingId) return;
    if (readOnly) return;
    const intent = attendanceIntent;
    if (attendedPeople === 0) {
      wrapAction(
        "已標記未到",
        () => markBookingNoShow(bookingId, "DEDUCTED"),
        "NO_SHOW",
        {
          onSuccess: () => {
            setAttendanceOpen(false);
            setAttendanceIntent(null);
          },
        },
      );
      return;
    }
    if (intent === "collect") {
      // 收款入口：暫存 N，開 CollectTrialModal；收款 server 在同 transaction 寫 DB。
      // 取消收款 → CollectTrialModal onClose 清掉 pendingAttendedPeople。
      setPendingAttendedPeople(attendedPeople);
      setAttendanceOpen(false);
      setAttendanceIntent(null);
      setCollectOpen(true);
      return;
    }
    const b = data?.booking;
    if (b?.bookingType === "PACKAGE_SESSION" && attendedPeople < b.people) {
      setPartialAttendedPeople(attendedPeople);
      setAttendanceOpen(false);
      setAttendanceIntent(null);
      setNoShowOpen(true);
      return;
    }
    // intent === "complete"（或 fallback）：直接完成服務，markCompleted 寫 DB。
    wrapAction(
      "已完成服務",
      () => updateBookingStatus(bookingId, "complete", { attendedPeople }),
      "COMPLETED",
      {
        expected: { attendedPeople },
        optimistic: true,
        onOptimistic: () => {
          setAttendanceOpen(false);
          setAttendanceIntent(null);
        },
        onRollback: () => {
          setAttendanceIntent("complete");
          setAttendanceOpen(true);
        },
        onSuccess: () => {
          setAttendanceOpen(false);
          setAttendanceIntent(null);
        },
      },
    );
  }

  function handleNoShowConfirm(choice: NoShowChoice) {
    if (readOnly) return;
    if (partialAttendedPeople != null) {
      const attendedPeople = partialAttendedPeople;
      wrapAction(
        "已完成服務並記錄部分未到",
        () =>
          updateBookingStatus(bookingId!, "complete", {
            attendedPeople,
            partialNoShowChoice: choice,
          }),
        "COMPLETED",
        {
          expected: { attendedPeople, makeupGranted: choice === "DEDUCTED_WITH_MAKEUP" },
          optimistic: true,
          onOptimistic: () => {
            setNoShowOpen(false);
            setPartialAttendedPeople(null);
          },
          onRollback: () => {
            setPartialAttendedPeople(attendedPeople);
            setNoShowOpen(true);
          },
          onSuccess: () => {
            setNoShowOpen(false);
            setPartialAttendedPeople(null);
          },
        },
      );
      return;
    }
    const makeupPeople =
      data?.booking.makeupCreditLinks?.length ??
      (data?.booking.isMakeup ? 1 : 0);
    const walletPeople = data?.booking.walletSessions?.length ?? 0;
    // 整筆補課未到：server 不扣堂、不發券，toast 不可說「扣堂並發補課」。
    const isFullMakeupBooking =
      (data?.booking.isMakeup ?? false) &&
      makeupPeople > 0 &&
      walletPeople === 0;
    const labelMap: Record<NoShowChoice, string> = {
      DEDUCTED: "已標記未到並扣堂",
      DEDUCTED_WITH_MAKEUP: "已標記未到、扣堂並發補課",
    };
    const label = isFullMakeupBooking ? "已標記未到" : labelMap[choice];
    wrapAction(label, () => markBookingNoShow(bookingId!, choice), "NO_SHOW", {
      expected: { makeupGranted: choice === "DEDUCTED_WITH_MAKEUP" },
      onSuccess: () => setNoShowOpen(false),
    });
  }

  function handleRescheduleConfirm(newDate: string, newSlotTime: string) {
    if (readOnly) return;
    // Reschedule moves the booking across days — the parent needs to
    // re-fetch the day panel rather than patch in place. We pass `null`
    // for nextStatus so the parent treats this as "needs day refresh".
    wrapAction(
      "已改期",
      () =>
        updateBooking(bookingId!, {
          bookingDate: newDate,
          slotTime: newSlotTime,
        }),
      null,
      { expected: { date: newDate, slotTime: newSlotTime }, onSuccess: () => setRescheduleOpen(false) },
    );
  }

  function handleCancel() {
    if (readOnly) return;
    if (!confirm("確定取消這筆預約？")) return;
    wrapAction("已取消預約", () => cancelBooking(bookingId!), "CANCELLED");
  }

  function handleRevert() {
    if (readOnly) return;
    // Revert returns to PENDING per booking.ts:867 logic.
    wrapAction("已還原狀態", () => updateBookingStatus(bookingId!, "revert"), "PENDING", { optimistic: true });
  }

  // 體驗 499 PR-3：現場收款成功 — 預約狀態不變，重抓 detail 讓
  // 付款狀態 / badge 翻成「已收款」；onUpdated(null) 讓母層重整當日資料
  // （月曆 strip 的 badge 一併更新）。
  // flow pivot：成功後 pendingAttendedPeople 已隨 server transaction 寫入 DB，
  // 清掉 in-memory 暫存即可。
  function handleCollected(serviceCompleted: boolean) {
    setCollectOpen(false);
    setPendingAttendedPeople(null);
    setReloadNonce((n) => n + 1);
    if (bookingId)
      onUpdated?.(bookingId, serviceCompleted ? "COMPLETED" : null);
  }

  // 單次（SINGLE，不扣堂）收款成功 — 同 trial 行為：重抓 detail 翻成
  // 「已收款」，並通知母層當日資料重整。
  function handleSingleCollected(serviceCompleted: boolean) {
    setCollectSingleOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId)
      onUpdated?.(
        bookingId,
        spaMode ? null : serviceCompleted ? "COMPLETED" : null,
      );
  }

  // 體驗 499 PR-3b：收款更正成功 — 同理重抓 detail（金額/付款方式翻新）
  // 並通知母層重整當日資料。
  function handleCorrected() {
    setCorrectOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId) onUpdated?.(bookingId, null);
  }

  // 調整結帳方式成功（SINGLE → PACKAGE_SESSION）— bookingType / wallet 翻轉，
  // 預約狀態不變。重抓 detail 讓 Drawer 顯示方案區塊；onUpdated(null) 讓母層
  // 重整當日資料（月曆 strip 的方案標籤一併更新）。
  function handleAdjusted() {
    setAdjustCheckoutOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId) onUpdated?.(bookingId, null);
  }

  // 方案扣堂改為單次後重抓明細；顯示「單次蒸足」與單次金額快照。
  function handleAdjustedToSingle() {
    setAdjustToSingleOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId) onUpdated?.(bookingId, null);
  }

  // What we have to render (priority):
  //   1. Full payload matching current bookingId — preferred when loaded (from
  //      fetch or cache). Enables the complete action footer.
  //   2. Prefill — instant header + basic body from in-memory day-list data,
  //      with inline loaders for the extras. The common path on first open.
  //   3. Pre-loaded summary — header only + skeleton body (fallback).
  //   4. Neither — full skeleton (rare).
  const hasFullData = dataMatches;
  const showPrefill = !hasFullData && !!prefill;
  const showHeaderFromSummary = !hasFullData && !prefill && !!summary;

  return (
    <>
      <RightSheet
        presentation={spaMode ? "side" : "centered"}
        open={open}
        onClose={() => { if (!participantBusy) onClose(); }}
        labelledById="booking-drawer-title"
        width={spaMode ? undefined : 860}
      >
        {open && <BookingActionFeedback state={actionState} onCheck={() => { void saves.check(actionKey); }} />}
        {open && operationGuidePreview && !spaMode && <BookingGuideContext status={hasFullData ? data?.booking.bookingStatus : undefined} />}
        {hasFullData &&
        data &&
        spaMode &&
        collectSingleOpen &&
        data.single &&
        !data.single.collected ? (
          <CollectSingleModal
            key={data.booking.id}
            open
            embedded
            onClose={() => setCollectSingleOpen(false)}
            bookingId={data.booking.id}
            customerName={data.booking.customer.name}
            dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
            defaultPrice={data.single.defaultPrice}
            spaMode
            serviceName={
              data.booking.treatmentNameSnapshot ??
              data.booking.servicePlan?.name ??
              "本次服務"
            }
            serviceMinutes={data.booking.treatmentServiceMinutesSnapshot}
            wallets={data.checkout?.wallets ?? []}
            storedValue={data.storedValue}
            onCollected={handleSingleCollected}
          />
        ) : hasFullData && data ? (
          <DrawerContent
            payload={pendingBalance !== null && data.booking.customerPlanWallet ? { ...data, booking: { ...data.booking, customerPlanWallet: { ...data.booking.customerPlanWallet, remainingSessions: pendingBalance } } } : data}
            onNoteSaved={(patch) => {
              setData((previous) => {
                if (!previous || previous.booking.id !== patch.bookingId) return previous;
                return { ...previous, booking: { ...previous.booking,
                  ...(patch.kind === "booking" ? { notes: patch.value } : {
                    customer: { ...previous.booking.customer, serviceNote: patch.value },
                  }),
                } };
              });
              onNotesUpdated?.(patch);
              if (bookingId) {
                cache?.invalidate(bookingId);
                onUpdated?.(bookingId, null);
              }
              setReloadNonce((n) => n + 1);
            }}
            isActing={isActing}
            onClose={() => { if (!participantBusy) onClose(); }}
            onParticipantBusy={setParticipantBusy}
            onParticipantsUpdated={() => {
              if (!bookingId) return;
              cache?.invalidate(bookingId); onUpdated?.(bookingId, null);
              setReloadNonce(n => n + 1);
            }}
            readOnly={readOnly}
            rebookHref={rebookHref}
            durationMinutes={durationMinutes}
            spaMode={spaMode}
            actions={{
              complete: handleComplete,
              noShow: () => setNoShowOpen(true),
              cancel: handleCancel,
              revert: handleRevert,
              reschedule: () => setRescheduleOpen(true),
              collect: handleCollect,
              correct: () => setCorrectOpen(true),
              collectSingle: () => setCollectSingleOpen(true),
              adjustCheckout: () => setAdjustCheckoutOpen(true),
              adjustToSingle: () => setAdjustToSingleOpen(true),
            }}
          />
        ) : showPrefill && prefill && !spaMode ? (
          <PendingSteamDetail
            prefill={prefillStatus ? { ...prefill, bookingStatus: prefillStatus, isCheckedIn: prefillStatus === "COMPLETED", customerPlanWallet: pendingBalance !== null && prefill.customerPlanWallet ? { ...prefill.customerPlanWallet, remainingSessions: pendingBalance } : prefill.customerPlanWallet } : prefill}
            durationMinutes={durationMinutes}
            error={error}
            onClose={onClose}
            onComplete={!readOnly && prefill.id === bookingId && prefill.people === 1 &&
              ["PENDING", "CONFIRMED"].includes(prefill.bookingStatus) &&
              (prefill.bookingType === "PACKAGE_SESSION" ||
                (["FIRST_TRIAL", "SINGLE"].includes(prefill.bookingType) && prefill.collected))
              ? handleComplete : undefined}
            isActing={isActing}
          />
        ) : showPrefill && prefill ? (
          <PrefillDrawerContent
            spaMode={spaMode}
            prefill={prefill}
            durationMinutes={durationMinutes}
            loading={loading}
            error={error}
            onClose={onClose}
          />
        ) : showHeaderFromSummary && summary ? (
          <SummaryDrawerContent
            spaMode={spaMode}
            summary={summary}
            durationMinutes={durationMinutes}
            loading={loading}
            error={error}
            onClose={onClose}
          />
        ) : (
          spaMode ? <DrawerSkeleton onClose={onClose} error={error} /> : <PendingSteamDetail onClose={onClose} error={error} />
        )}
      </RightSheet>
      {!readOnly && (
        <NoShowModal
          open={noShowOpen && !!data && !checkingResult}
          onClose={() => {
            setNoShowOpen(false);
            setPartialAttendedPeople(null);
          }}
          onConfirm={handleNoShowConfirm}
          loading={isActing}
          partial={partialAttendedPeople != null}
          affectedPeople={
            partialAttendedPeople != null
              ? (data?.booking.people ?? 0) - partialAttendedPeople
              : undefined
          }
          isMakeup={
            (data?.booking.isMakeup ?? false) &&
            (data?.booking.makeupCreditLinks?.length ?? 0) > 0 &&
            (data?.booking.walletSessions?.length ?? 0) === 0
          }
        />
      )}
      {!readOnly &&
        data &&
        !data.participantCheckout &&
        (data.booking.bookingType === "FIRST_TRIAL" ||
          data.booking.bookingType === "PACKAGE_SESSION") &&
        data.booking.people > 1 && (
          <AttendanceModal
            open={attendanceOpen && !checkingResult}
            onClose={() => {
              setAttendanceOpen(false);
              setAttendanceIntent(null);
            }}
            people={data.booking.people}
            trialDefaultUnit={data.trial?.settings.defaultPrice ?? null}
            onConfirm={handleAttendanceConfirm}
            loading={isActing}
          />
        )}
      {!readOnly && data && (
        <RescheduleModal
          open={rescheduleOpen && !checkingResult}
          onClose={() => setRescheduleOpen(false)}
          currentDate={data.booking.bookingDate}
          currentSlotTime={data.booking.slotTime}
          people={data.booking.people}
          onConfirm={handleRescheduleConfirm}
          loading={isActing}
        />
      )}
      {!readOnly && data && !data.participantCheckout && data.trial && !data.trial.collected && (
        <CollectTrialModal
          saveAction={collectBookingTrialPayment}
          open={collectOpen}
          onClose={() => {
            setCollectOpen(false);
            // 取消收款：清掉 AttendanceModal 暫存值，避免下次重開抓到髒值。
            // attendedPeople 尚未進入 server transaction，DB 不留任何寫入。
            setPendingAttendedPeople(null);
          }}
          bookingId={data.booking.id}
          customerName={data.booking.customer.name}
          dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
          expectedAmount={data.booking.expectedAmount}
          people={data.booking.people}
          // flow pivot：收款入口先 AttendanceModal 時 pendingAttendedPeople 帶入；
          // 否則 fallback 為 DB 上已記錄的 attendedPeople（多半為 null）。
          attendedPeople={pendingAttendedPeople ?? data.booking.attendedPeople}
          settings={data.trial.settings}
          onCollected={handleCollected}
        />
      )}
      {!readOnly &&
        data &&
        data.trial &&
        data.trial.collected &&
        data.trial.canCorrect &&
        data.trial.collectedTransactionId && (
          <CorrectTrialCollectionModal
            saveAction={correctBookingTrialCollection}
            onReconcile={handleCorrected}
            open={correctOpen}
            onClose={() => setCorrectOpen(false)}
            bookingId={data.booking.id}
            originalTransactionId={data.trial.collectedTransactionId}
            customerName={data.booking.customer.name}
            dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
            originalAmount={data.trial.collectedAmount}
            originalMethod={data.trial.collectedMethod}
            originalDate={data.trial.collectedAt}
            people={data.booking.people}
            attendedPeople={data.booking.attendedPeople}
            settings={data.trial.settings}
            onCorrected={handleCorrected}
          />
        )}
      {!readOnly &&
        !spaMode &&
        data &&
        data.single &&
        !data.single.collected && (
          <CollectSingleModal
            key={data.booking.id}
            open={collectSingleOpen}
            onClose={() => setCollectSingleOpen(false)}
            bookingId={data.booking.id}
            customerName={data.booking.customer.name}
            dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
            defaultPrice={data.single.defaultPrice}
            spaMode={spaMode}
            people={data.booking.people}
            serviceName={
              data.booking.treatmentNameSnapshot ??
              data.booking.servicePlan?.name ??
              (data.booking.bookingType === "SINGLE"
                ? "單次蒸足"
                : "本次服務")
            }
            serviceMinutes={data.booking.treatmentServiceMinutesSnapshot}
            wallets={data.checkout?.wallets ?? []}
            storedValue={data.storedValue}
            onCollected={handleSingleCollected}
          />
        )}
      {!readOnly &&
        data &&
        data.checkout &&
        data.checkout.canAdjustToPackage && (
          <AdjustCheckoutModal
            open={adjustCheckoutOpen}
            onClose={() => setAdjustCheckoutOpen(false)}
            bookingId={data.booking.id}
            customerName={data.booking.customer.name}
            dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
            wallets={data.checkout.wallets}
            onAdjusted={handleAdjusted}
          />
        )}
      {!readOnly &&
        data &&
        data.checkoutToSingle &&
        data.checkoutToSingle.canAdjustToSingle && (
          <AdjustCheckoutModal
            mode="toSingle"
            open={adjustToSingleOpen}
            onClose={() => setAdjustToSingleOpen(false)}
            bookingId={data.booking.id}
            customerName={data.booking.customer.name}
            dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
            currentPlanName={data.checkoutToSingle.currentPlanName}
            currentRemaining={data.checkoutToSingle.currentRemaining}
            singleDefaultPrice={data.checkoutToSingle.singleDefaultPrice}
            onAdjusted={handleAdjustedToSingle}
          />
        )}
    </>
  );
}

// ============================================================
// Drawer content
// ============================================================

interface DrawerActions {
  complete: () => void;
  noShow: () => void;
  cancel: () => void;
  revert: () => void;
  reschedule: () => void;
  collect: () => void;
  correct: () => void;
  collectSingle: () => void;
  adjustCheckout: () => void;
  adjustToSingle: () => void;
}

function DrawerContent({
  payload,
  onNoteSaved,
  isActing,
  onClose,
  actions,
  readOnly = false,
  rebookHref,
  durationMinutes,
  spaMode = false,
  onParticipantsUpdated,
  onParticipantBusy,
}: {
  payload: BookingDrawerPayload;
  onNoteSaved: (patch: BookingNotePatch) => void;
  isActing: boolean;
  onClose: () => void;
  actions: DrawerActions;
  readOnly?: boolean;
  rebookHref?: string;
  durationMinutes?: number;
  spaMode?: boolean;
  onParticipantsUpdated: () => void;
  onParticipantBusy: (busy: boolean) => void;
}) {
  const {
    booking,
    customerSummary,
    trial,
    single,
    checkout,
    checkoutToSingle,
    storedValue,
  } = payload;
  const meta = bookingStatusMeta(
    booking.bookingStatus,
    spaMode ? false : booking.isCheckedIn,
  );
  const statusLabel = spaMode
    ? booking.bookingStatus === "COMPLETED"
      ? "已完成"
      : booking.bookingStatus === "NO_SHOW"
        ? "未到"
        : booking.bookingStatus === "CANCELLED"
          ? "已取消"
          : "待服務"
    : meta.label;
  const amount = computeAmount(booking, trial);
  const planExpiry = bookingPlanExpiry(booking.customerPlanWallet?.expiryDate);
  const duration =
    durationMinutes ?? (spaMode ? (booking.servicePlan?.category === "TRIAL" ? 30 : 60) : null);
  const endTime = duration != null ? computeEndTime(booking.slotTime, duration) : null;
  const dateLabel = formatDateLabel(booking.bookingDate);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{statusLabel}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {booking.bookingDate.slice(5).replace("-", "/")}{" "}
              {booking.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className={spaMode ? "mt-1 truncate text-lg font-bold text-earth-900" : "mt-2 break-words text-xl font-bold text-earth-900"}
          >
            {booking.customer.name}
            {booking.people > 1 && <PeopleBadge people={booking.people} />}
          </h2>
          <p className={spaMode ? "mt-0.5 truncate text-sm text-earth-500" : "mt-1 break-words text-base text-earth-600"}>
            {!spaMode && booking.bookingType === "FIRST_TRIAL"
              ? (duration != null ? "首次體驗 · " : "首次體驗")
              : booking.isMakeup
              ? (duration != null ? "補課 · " : "補課")
              : booking.treatmentNameSnapshot
                ? `${booking.treatmentNameSnapshot}${duration != null ? " · " : ""}`
                : booking.servicePlan?.name
                  ? `${booking.servicePlan.name}${duration != null ? " · " : ""}`
                  : booking.bookingType === "SINGLE"
                    ? (duration != null ? "單次蒸足 · " : "單次蒸足")
                    : ""}
            {duration != null ? `${duration} 分鐘` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      {/* Body — scrollable */}
      <DetailBody spaMode={spaMode} appointment={
        <Section readable={!spaMode} title="預約資訊">
          <KV readable={!spaMode} label={spaMode ? "日期" : "日期時間"} value={spaMode ? dateLabel : `${dateLabel} ${booking.slotTime}${endTime ? ` - ${endTime}` : ""}`} />
          {spaMode && <KV readable={!spaMode}
            label="時間"
            value={
              <span className="tabular-nums">
                {booking.slotTime}{endTime ? ` - ${endTime}` : ""}
              </span>
            }
          />}
          <KV readable={!spaMode}
            label="教練"
            value={booking.revenueStaff?.displayName ?? "未指派"}
            icon={
              booking.revenueStaff?.colorCode && (
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: booking.revenueStaff.colorCode }}
                />
              )
            }
          />
          {booking.serviceStaff &&
            booking.serviceStaff.id !== booking.revenueStaff?.id && (
              <KV readable={!spaMode} label="值班店長" value={booking.serviceStaff.displayName} />
            )}
          <KV readable={!spaMode}
            label="服務"
            value={
              !spaMode && booking.bookingType === "FIRST_TRIAL"
                ? "首次體驗"
                : booking.isMakeup
                ? "補課"
                : (booking.treatmentNameSnapshot ??
                  booking.servicePlan?.name ??
                  (booking.bookingType === "SINGLE" ? "單次蒸足" : !spaMode && booking.bookingType === "PACKAGE_SESSION" ? "方案服務" : "—"))
            }
          />
          {!spaMode && booking.bookingType === "FIRST_TRIAL" && (
            <KV readable label="預約來源" value={trialBookingSourceLabel(booking.bookingSource)} />
          )}
          <KV readable={!spaMode} label="人數" value={`${booking.people} 人`} />
          {!spaMode && (
            <div className="col-span-2 mt-1 border-t border-earth-100 pt-2">
              <OperationHistoryButton targetType="Booking" targetId={booking.id} />
            </div>
          )}
          {booking.attendedPeople != null &&
            booking.attendedPeople < booking.people && (
              <KV readable={!spaMode}
                label="實際到店"
                value={`${booking.attendedPeople} / ${booking.people} 人`}
              />
            )}
          {(spaMode || (booking.bookingType !== "FIRST_TRIAL" && booking.bookingType !== "PACKAGE_SESSION")) && (
            <KV readable={!spaMode} label="金額" value={amount} />
          )}
        </Section>

        } customer={
        <Section readable={!spaMode} title="顧客資訊">
          {!spaMode && payload.companions && <BookingCompanionEditor bookingId={booking.id} companions={payload.companions} readOnly={readOnly || isActing} onUpdated={onParticipantsUpdated} />}
          {spaMode && <KV label="姓名" value={booking.customer.name} />}
          <KV readable={!spaMode}
            label="電話"
            value={
              booking.customer.phone ? (
                <a
                  href={`tel:${booking.customer.phone}`}
                  className={spaMode ? "text-primary-600 hover:text-primary-700" : "inline-flex min-h-11 items-center break-all text-primary-700 underline decoration-primary-300 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"}
                >
                  {booking.customer.phone}
                </a>
              ) : (
                "—"
              )
            }
          />
          {!spaMode ? (
            <BookingServiceNoteEditor
              key={booking.customer.id}
              customerId={booking.customer.id}
              value={booking.customer.serviceNote}
              canEdit={!readOnly && payload.canEditServiceNote === true}
              onSaved={(value) => onNoteSaved({ kind: "customer", bookingId: booking.id, customerId: booking.customer.id, value })}
            />
          ) : null}
          {spaMode && booking.customer.serviceNote ? (
            <KV label="服務備註" value={<span className="whitespace-pre-wrap text-amber-800">{booking.customer.serviceNote}</span>} />
          ) : null}
          <KV readable={!spaMode} label="累積完成" value={`${customerSummary.totalBookings} 次`} />
          <KV readable={!spaMode}
            label="最近到店"
            value={
              customerSummary.lastVisit
                ? customerSummary.lastVisit
                : customerSummary.isNewCustomer
                  ? "（新客）"
                  : "—"
            }
          />
          <div className={spaMode ? "col-span-2 mt-1 flex gap-2" : "col-span-2 mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"}>
            <Link
              href={`/dashboard/customers/${booking.customer.id}`}
              className={spaMode ? "inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50" : "inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 bg-white px-3 py-2 text-base font-medium text-earth-700 hover:bg-earth-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"}
            >
              查看顧客資料
            </Link>
            <Link
              href={`/dashboard/customers/${booking.customer.id}#bookings`}
              className={spaMode ? "inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50" : "inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 bg-white px-3 py-2 text-base font-medium text-earth-700 hover:bg-earth-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"}
            >
              查看歷史預約
            </Link>
          </div>
        </Section>

        } payment={
        !spaMode && payload.participantCheckout ? <BookingParticipantCheckout bookingId={booking.id} checkout={payload.participantCheckout}
          readOnly={readOnly} blocked={isActing} onUpdated={onParticipantsUpdated} onBusy={onParticipantBusy} /> :
        <Section readable={!spaMode} title={spaMode ? "方案 / 付款" : "收款與扣堂"}>
          {!spaMode && booking.bookingType === "FIRST_TRIAL" ? (
            <KV readable label="金額" value={amount} />
          ) : (spaMode || booking.bookingType !== "PACKAGE_SESSION") ? (
            <KV readable={!spaMode} label="類型" value={formatBookingType(booking)} />
          ) : null}
          {(spaMode || booking.bookingType === "PACKAGE_SESSION") && (
            <KV readable={!spaMode}
              label="方案"
              value={booking.customerPlanWallet?.plan.name ?? booking.servicePlan?.name ?? "—"}
            />
          )}
          {!spaMode && booking.bookingType === "PACKAGE_SESSION" && !booking.isMakeup && (
            <KV readable label="到期日" value={<span className={planExpiry.className}>{planExpiry.detail}</span>} />
          )}
          {booking.customerPlanWallet && (
            <KV readable={!spaMode}
              label={!spaMode && booking.bookingType === "PACKAGE_SESSION" ? "剩餘堂數" : "套餐剩餘"}
              value={`${booking.customerPlanWallet.remainingSessions} / ${booking.customerPlanWallet.totalSessions} 堂`}
            />
          )}
          <KV readable={!spaMode}
            label={!spaMode && booking.bookingType === "PACKAGE_SESSION" ? (["PENDING", "CONFIRMED"].includes(booking.bookingStatus) ? "本次使用" : "結帳方式") : "付款狀態"}
            value={
              !spaMode && booking.bookingType === "PACKAGE_SESSION"
                ? ["PENDING", "CONFIRMED"].includes(booking.bookingStatus)
                  ? packageUsageSummary(booking)
                  : booking.isMakeup ? "使用補課資格" : "依方案扣堂"
                : booking.isMakeup
                ? "補課（免費）"
                : booking.bookingType === "PACKAGE_SESSION"
                  ? "套餐扣堂"
                  : trial
                    ? trial.collected
                      ? "已收款"
                      : "未收款（現場收款）"
                    : single
                      ? single.collected
                        ? "已收款"
                        : "未收款（現場收款）"
                      : booking.servicePlan
                        ? "現場收款"
                        : "—"
            }
          />
          {!spaMode && booking.bookingType === "PACKAGE_SESSION" && ["PENDING", "CONFIRMED"].includes(booking.bookingStatus) && (
            <details className="col-span-2 text-sm leading-relaxed text-earth-500"><summary className="cursor-pointer py-1">扣堂說明</summary><p>依本筆預約名額顯示，完成時仍會核對方案與堂數；部分未到依選擇的處理方式辦理。</p></details>
          )}
          {trial && trial.collected && (
            <>
              <KV readable={!spaMode}
                label="付款方式"
                value={
                  trial.collectedMethod
                    ? (PAYMENT_METHOD_LABEL[trial.collectedMethod] ??
                      trial.collectedMethod)
                    : "—"
                }
              />
              <KV readable={!spaMode}
                label="收款金額"
                value={
                  trial.collectedAmount == null
                    ? "—"
                    : `NT$ ${trial.collectedAmount.toLocaleString()}`
                }
              />
              {trial.collectedAt && (
                <KV readable={!spaMode} label="收款日期" value={trial.collectedAt} />
              )}
            </>
          )}
          {single && single.collected && (
            <>
              <KV readable={!spaMode}
                label="付款方式"
                value={
                  single.collectedMethod
                    ? (PAYMENT_METHOD_LABEL[single.collectedMethod] ??
                      single.collectedMethod)
                    : "—"
                }
              />
              <KV readable={!spaMode}
                label="收款金額"
                value={
                  single.collectedAmount == null
                    ? "—"
                    : `NT$ ${single.collectedAmount.toLocaleString()}`
                }
              />
              {single.collectedDiscountAmount != null &&
                single.collectedDiscountAmount > 0 && (
                  <KV readable={!spaMode}
                    label="折扣"
                    value={`NT$ ${single.collectedDiscountAmount.toLocaleString()}`}
                  />
                )}
              {single.collectedAt && (
                <KV readable={!spaMode} label="收款日期" value={single.collectedAt} />
              )}
            </>
          )}
          {trial &&
            trial.collected &&
            booking.bookingStatus !== "PENDING" &&
            booking.bookingStatus !== "CONFIRMED" && (
              <div className="col-span-2 mt-1 rounded-md bg-earth-50 px-3 py-2 text-[11px] leading-relaxed text-earth-500">
                此筆已完成服務，如需更正收款請改走交易作廢流程。
              </div>
            )}
          {trial && !trial.collected && booking.expectedAmount != null && (
            <KV readable={!spaMode}
              label="預計收款"
              value={`NT$ ${booking.expectedAmount.toLocaleString()}`}
            />
          )}
          {single && !single.collected && (
            <KV readable={!spaMode}
              label="預計收款"
              value={`NT$ ${single.defaultPrice.toLocaleString()}`}
            />
          )}
          {spaMode && storedValue ? (
            <KV readable={!spaMode}
              label="儲值金餘額"
              value={`NT$ ${storedValue.balance.toLocaleString("zh-TW")}`}
            />
          ) : null}
        </Section>

        } notes={spaMode ? (booking.notes ? (
          <Section title="備註">
            <div className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-earth-700">{booking.notes}</div>
          </Section>
        ) : null) : (
          <div className="border-b border-earth-100 p-4">
            <BookingNoteEditor
              key={booking.id}
              bookingId={booking.id}
              value={booking.notes}
              canEdit={!readOnly && payload.canEditBookingNote === true}
              onSaved={(value) => onNoteSaved({ kind: "booking", bookingId: booking.id, value })}
            />
          </div>
        )} />

      {/* Section E: Actions */}
      {readOnly ? (
        <div className="border-t border-earth-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          查看模式提供完整閱讀能力，完成服務、取消、收款與改期請由該店自行完成。
        </div>
      ) : payload.participantCheckout ? (
        <div className="border-t border-earth-200 px-4 py-2">
          {payload.canEditBookingNote && ["PENDING", "CONFIRMED"].includes(booking.bookingStatus) && payload.participantCheckout.slots.every(slot => slot.status === "PENDING" && slot.collectedAmount === null) &&
            <button type="button" disabled={isActing} onClick={actions.reschedule} className="min-h-11 rounded-lg border border-earth-300 px-3 text-base disabled:opacity-50">改期</button>}
        </div>
      ) : (
        <ActionFooter
          booking={booking}
          trial={trial}
          single={single}
          checkout={checkout}
          checkoutToSingle={checkoutToSingle}
          isActing={isActing}
          actions={actions}
          rebookHref={rebookHref}
          spaMode={spaMode}
        />
      )}
    </>
  );
}

/**
 * Renders the same header band as the full drawer using only the lightweight
 * `summary` already in memory — appears instantly on click. The body slot
 * shows skeleton placeholders until `fetchBookingDetail` resolves.
 */

/** Immediate snapshot. Unknown fields never masquerade as empty data.
 * Only eligible single-person completion is exposed before full detail arrives;
 * the server still authorizes and validates every mutation. */
function PendingSteamDetail({ prefill, summary, durationMinutes, error, onClose, onComplete, isActing = false }: {
  prefill?: BookingPrefill;
  summary?: BookingSummary;
  durationMinutes?: number;
  error: string | null;
  onClose: () => void;
  onComplete?: () => void;
  isActing?: boolean;
}) {
  const known = prefill ?? summary;
  const pending = <span className="text-earth-500">讀取中…</span>;
  const meta = known ? bookingStatusMeta(known.bookingStatus, prefill?.isCheckedIn ?? false) : null;
  const service = prefill
    ? prefill.bookingType === "FIRST_TRIAL" ? "首次體驗" : prefill.isMakeup ? "補課" : prefill.servicePlanName ?? (prefill.bookingType === "SINGLE" ? "單次蒸足" : prefill.bookingType === "PACKAGE_SESSION" ? "方案服務" : null)
    : summary?.isMakeup ? "補課" : summary?.servicePlanName;
  const subtitle = prefill?.bookingType === "PACKAGE_SESSION" && !prefill.servicePlanName && !prefill.isMakeup ? null : service;
  const active = !known || ["PENDING", "CONFIRMED"].includes(known.bookingStatus);
  const packagePlanName = prefill
    ? prefill.customerPlanWallet?.planName ?? prefill.servicePlanName ?? "—"
    : pending;
  const packageExpiryMeta = prefill?.customerPlanWallet
    ? bookingPlanExpiry(prefill.customerPlanWallet.expiryDate)
    : null;
  const packageExpiry = !prefill
    ? pending
    : prefill.isMakeup
      ? "不適用"
      : packageExpiryMeta
        ? <span className={packageExpiryMeta.className}>{packageExpiryMeta.detail}</span>
        : "—";
  const packageRemaining = !prefill
    ? pending
    : prefill.customerPlanWallet
      ? `${prefill.customerPlanWallet.remainingSessions} 堂`
      : "—";
  const deductedPlanNames = prefill?.deductedPlanNames ?? [];
  const packageUsage = !prefill
    ? pending
    : active
      ? prefill.isMakeup
        ? "補課資格（完成時核對）"
        : "依方案扣堂（完成時核對）"
      : prefill.isMakeup
        ? "使用補課資格"
        : deductedPlanNames.length > 0
          ? `已扣：${deductedPlanNames.join("、")}`
          : "依方案扣堂";
  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {meta ? <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge> : pending}
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {known ? `${known.bookingDate.slice(5).replace("-", "/")} ${known.slotTime}` : pending}
            </span>
          </div>
          <h2 id="booking-drawer-title" className="mt-2 break-words text-xl font-bold text-earth-900">
            {known?.customerName ?? "讀取預約中…"}
            {known && known.people > 1 && <PeopleBadge people={known.people} />}
          </h2>
          <p className="mt-1 break-words text-base text-earth-600">
            {subtitle}{subtitle && durationMinutes != null ? " · " : ""}{durationMinutes != null ? `${durationMinutes} 分鐘` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="關閉" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100">✕</button>
      </div>
      <DetailBody busy={!error} appointment={
        <Section readable title="預約資訊">
          <KV readable label="日期時間" value={known ? `${formatDateLabel(known.bookingDate)} ${known.slotTime}${durationMinutes != null ? ` - ${computeEndTime(known.slotTime, durationMinutes)}` : ""}` : pending} />
          <KV readable label="教練" value={prefill ? prefill.revenueStaff?.displayName ?? "未指派" : pending} icon={prefill?.revenueStaff?.colorCode && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{backgroundColor:prefill.revenueStaff.colorCode}} />} />
          {prefill?.serviceStaffName && prefill.serviceStaffName !== prefill.revenueStaff?.displayName && <KV readable label="值班店長" value={prefill.serviceStaffName} />}
          <KV readable label="服務" value={service ?? pending} />
          <KV readable label="人數" value={known ? `${known.people} 人` : pending} />
          {prefill?.attendedPeople != null && prefill.attendedPeople < prefill.people && <KV readable label="實際到店" value={`${prefill.attendedPeople} / ${prefill.people} 人`} />}
        </Section>
        } customer={
        <Section readable title="顧客資訊">
          <KV readable label="電話" value={prefill ? prefill.customerPhone ? <a href={`tel:${prefill.customerPhone}`} className="inline-flex min-h-11 items-center break-all text-primary-700 underline decoration-primary-300 underline-offset-4">{prefill.customerPhone}</a> : "—" : pending} />
          <div className="col-span-2 rounded-lg border border-earth-200 bg-earth-50 px-3 py-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <p className="text-sm font-medium text-earth-600">店內備註</p>
              <button disabled type="button" className="min-h-11 px-3 text-sm text-earth-500">讀取中…</button>
            </div>
            <p className="text-xs text-earth-500">僅店內可見，每次服務都適用</p>
            {prefill?.serviceNote?.trim() && <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-earth-800">{prefill.serviceNote}</p>}
          </div>
          <KV readable label="累積完成" value={pending} />
          <KV readable label="最近到店" value={pending} />
          <div className="col-span-2 mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            {["查看顧客資料", "查看歷史預約"].map((label, index) => prefill?.customerId ? (
              <Link key={label} href={`/dashboard/customers/${prefill.customerId}${index === 1 ? "#bookings" : ""}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 px-3 py-2 text-base text-earth-700">{label}</Link>
            ) : <button key={label} disabled type="button" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 px-3 py-2 text-base text-earth-500">{label}</button>)}
          </div>
        </Section>
        } payment={
        <Section readable title="收款與扣堂">
          {prefill?.bookingType === "FIRST_TRIAL" || prefill?.bookingType === "SINGLE" ? <>
            <KV readable label="金額" value={prefillAmount(prefill)} />
            <KV readable label="付款狀態" value={prefill ? prefill.collected ? "已收款" : "未收款（現場收款）" : pending} />
            <KV readable label="付款方式" value={pending} />
            <KV readable label="收款日期" value={pending} />
          </> : <>
            <KV readable label="方案" value={packagePlanName} />
            <KV readable label="到期日" value={packageExpiry} />
            <KV readable label="剩餘堂數" value={packageRemaining} />
            <KV readable label={active ? "本次使用" : "結帳方式"} value={packageUsage} />
          </>}
        </Section>
      } />
      <div className={`shrink-0 border-t border-earth-200 bg-earth-50 px-4 py-3 ${active ? "min-h-[116px]" : "min-h-[76px]"}`}>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p role="status" className="text-sm text-earth-500">其他明細背景同步中</p>}
        <div className="mt-2 flex gap-2">
          {active && onComplete ? (
            <button type="button" disabled={isActing} onClick={onComplete} className="inline-flex min-h-11 items-center rounded-md bg-primary-600 px-3 text-sm font-semibold text-white disabled:opacity-60">完成服務</button>
          ) : <span className="text-sm text-earth-500">{active ? "其他操作準備中" : "更新明細中"}</span>}
        </div>
      </div>
    </>
  );
}

function SummaryDrawerContent({
  summary,
  durationMinutes,
  spaMode,
  loading,
  error,
  onClose,
}: {
  summary: BookingSummary;
  durationMinutes?: number;
  spaMode: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const meta = bookingStatusMeta(summary.bookingStatus, false);
  const duration =
    durationMinutes ?? (spaMode ? (summary.servicePlanCategory === "TRIAL" ? 30 : 60) : null);

  if (!spaMode) return <PendingSteamDetail summary={summary} durationMinutes={durationMinutes} error={error} onClose={onClose} />;

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {summary.bookingDate.slice(5).replace("-", "/")}{" "}
              {summary.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className="mt-1 truncate text-lg font-bold text-earth-900"
          >
            {summary.customerName}
            {summary.people > 1 && <PeopleBadge people={summary.people} />}
          </h2>
          <p className="mt-0.5 truncate text-sm text-earth-500">
            {summary.isMakeup
              ? (duration != null ? "補課 · " : "補課")
              : summary.servicePlanName
                ? `${summary.servicePlanName}${duration != null ? " · " : ""}`
                : ""}
            {duration != null ? `${duration} 分鐘` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <>
            {loading && (
              <LoadingStatus>讀取詳細資料中，請稍候…</LoadingStatus>
            )}
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-md border border-earth-100 bg-earth-50"
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

/**
 * PR-Frontend：用當日清單已有的 prefill 立即渲染抽屜 header + body 基本區塊
 * （預約資訊 / 顧客 / 金額提示），其餘（顧客近況 / 完整付款明細 / 操作按鈕）
 * 等 fetchBookingDetail 回來才補上。**不**從 prefill 啟用任何會改資料的操作。
 */
function PrefillDrawerContent({
  prefill,
  durationMinutes,
  spaMode,
  loading,
  error,
  onClose,
}: {
  prefill: BookingPrefill;
  durationMinutes?: number;
  spaMode: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const meta = bookingStatusMeta(prefill.bookingStatus, prefill.isCheckedIn);
  const duration =
    durationMinutes ?? (spaMode ? (prefill.bookingType === "FIRST_TRIAL" ? 30 : 60) : null);
  const endTime = duration != null ? computeEndTime(prefill.slotTime, duration) : null;
  const dateLabel = formatDateLabel(prefill.bookingDate);
  const amount = prefillAmount(prefill);
  const showServiceStaff =
    !!prefill.serviceStaffName &&
    prefill.serviceStaffName !== prefill.revenueStaff?.displayName;

  if (!spaMode) return <PendingSteamDetail prefill={prefill} durationMinutes={durationMinutes} error={error} onClose={onClose} />;

  return (
    <>
      {/* Header — 與完整抽屜同一條 band */}
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {prefill.bookingDate.slice(5).replace("-", "/")}{" "}
              {prefill.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className="mt-1 truncate text-lg font-bold text-earth-900"
          >
            {prefill.customerName}
            {prefill.people > 1 && <PeopleBadge people={prefill.people} />}
          </h2>
          <p className="mt-0.5 truncate text-sm text-earth-500">
            {prefill.isMakeup
              ? (duration != null ? "補課 · " : "補課")
              : prefill.servicePlanName
                ? `${prefill.servicePlanName}${duration != null ? " · " : ""}`
                : prefill.bookingType === "SINGLE"
                  ? (duration != null ? "單次蒸足 · " : "單次蒸足")
                  : ""}
            {duration != null ? `${duration} 分鐘` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <p className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* 預約資訊 — 全部來自當日清單，立即顯示 */}
        <Section title="預約資訊">
          <KV label="日期" value={dateLabel} />
          <KV
            label="時間"
            value={
              <span className="tabular-nums">
                {prefill.slotTime}{endTime ? ` - ${endTime}` : ""}
              </span>
            }
          />
          <KV
            label="教練"
            value={prefill.revenueStaff?.displayName ?? "未指派"}
            icon={
              prefill.revenueStaff?.colorCode && (
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: prefill.revenueStaff.colorCode }}
                />
              )
            }
          />
          {showServiceStaff && (
            <KV label="值班店長" value={prefill.serviceStaffName!} />
          )}
          <KV
            label="服務"
            value={
              prefill.isMakeup
                ? "補課"
                : (prefill.servicePlanName ??
                  (prefill.bookingType === "SINGLE" ? "單次蒸足" : "—"))
            }
          />
          <KV label="人數" value={`${prefill.people} 人`} />
          {prefill.attendedPeople != null &&
            prefill.attendedPeople < prefill.people && (
              <KV
                label="實際到店"
                value={`${prefill.attendedPeople} / ${prefill.people} 人`}
              />
            )}
          <KV label="金額" value={amount} />
        </Section>

        {/* 顧客資訊 — name/phone 來自當日清單 */}
        <Section title="顧客資訊">
          <KV label="姓名" value={prefill.customerName} />
          <KV
            label="電話"
            value={
              prefill.customerPhone ? (
                <a
                  href={`tel:${prefill.customerPhone}`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {prefill.customerPhone}
                </a>
              ) : (
                "—"
              )
            }
          />
          {prefill.serviceNote ? (
            <KV
              label="服務備註"
              value={
                <span className="whitespace-pre-wrap text-amber-800">
                  {prefill.serviceNote}
                </span>
              }
            />
          ) : null}
        </Section>

        {/* 顧客近況 / 完整付款明細 / 操作 —— 等 authoritative payload 補齊 */}
        <div className="space-y-3 p-4">
          {loading && (
            <LoadingStatus>讀取完整資料中，請稍候…</LoadingStatus>
          )}
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md border border-earth-100 bg-earth-50"
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Prefill 的金額顯示（唯讀提示）。FIRST_TRIAL 沿用 resolveTrialDisplayAmount；
 * 已收款顯示實收；其餘（PACKAGE/SINGLE 原價）當日清單沒有 price，先顯示
 * 「載入中…」，等 authoritative payload 的 computeAmount 補上精確值。
 */
function prefillAmount(p: BookingPrefill): string {
  if (p.isMakeup) return "補課（免費）";
  if (p.collected && p.collectedAmount != null) {
    return `已收 NT$ ${p.collectedAmount.toLocaleString()}`;
  }
  if (p.bookingType === "FIRST_TRIAL") {
    const display = resolveTrialDisplayAmount({
      snapshotTotal: p.expectedAmount,
      unitFallback: p.trialDefaultPrice,
      people: p.people,
    });
    return display == null ? "—" : `NT$ ${display.toLocaleString()}`;
  }
  if (p.expectedAmount != null) {
    return `NT$ ${p.expectedAmount.toLocaleString()}`;
  }
  return "載入中…";
}

function ActionFooter({
  booking,
  trial,
  single,
  checkout,
  checkoutToSingle,
  isActing,
  actions,
  rebookHref,
  spaMode = false,
}: {
  booking: BookingDrawerPayload["booking"];
  trial: BookingDrawerPayload["trial"];
  single: BookingDrawerPayload["single"];
  checkout: BookingDrawerPayload["checkout"];
  checkoutToSingle: BookingDrawerPayload["checkoutToSingle"];
  isActing: boolean;
  actions: DrawerActions;
  rebookHref?: string;
  spaMode?: boolean;
}) {
  const status = booking.bookingStatus;
  const primaries: Array<{ label: string; onClick: () => void }> = [];
  const secondaries: Array<{
    label: string;
    onClick: () => void;
    tone?: "danger";
  }> = [];

  // 體驗 499 PR-3：FIRST_TRIAL 且尚未收款 + 預約仍 PENDING/CONFIRMED →
  // 顯示「收款」主鈕（drawer-only：收款是營收動作，集中在預約明細操作）。
  const canCollect =
    trial != null &&
    !trial.collected &&
    (status === "PENDING" || status === "CONFIRMED");

  // SINGLE 不扣堂：尚未收款 + PENDING/CONFIRMED → 顯示「收款」主鈕。
  // markCompleted 已加 server guard：未收款的 SINGLE 直接點完成服務會被擋
  // （toast 顯示「請先完成單次收款後再完成服務」），此處的 client UI 只是把
  // 主動線提示給店長，server 仍是最後防線。
  const canCollectSingle =
    single != null &&
    !single.collected &&
    (status === "PENDING" || status === "CONFIRMED");

  // main schema 無 CHECKED_IN：PENDING/CONFIRMED 直接走「完成服務」→ COMPLETED。
  // （checkInBooking server action 實際上就是 markCompleted 的 alias，保留舊命名無意義。）
  // 體驗 499 PR-3b：已收款 + 有 transaction.void 權限（OWNER）→ 顯示
  // 「收款更正」（= 作廢原收款 + 重收）。僅 PENDING/CONFIRMED；COMPLETED
  // 不提供一鍵更正（改於明細區顯示提示）。
  const canCorrect =
    trial != null &&
    trial.collected &&
    trial.canCorrect &&
    (status === "PENDING" || status === "CONFIRMED");

  // 調整結帳方式（SINGLE 未收款 → 方案扣堂）：server 已用同源 guard 判定
  // canAdjustToPackage；此處只負責呈現次要動線。狀態限制已含於 server 判斷，
  // 但仍保留 PENDING/CONFIRMED 條件與其他動線一致。
  const canAdjustCheckout =
    checkout != null &&
    checkout.canAdjustToPackage &&
    (status === "PENDING" || status === "CONFIRMED");

  const canAdjustToSingle =
    checkoutToSingle != null &&
    checkoutToSingle.canAdjustToSingle &&
    (status === "PENDING" || status === "CONFIRMED");

  if (status === "PENDING" || status === "CONFIRMED") {
    if (canCollect) {
      primaries.push({
        label: spaMode ? "完成服務並收費" : "收款並完成服務",
        onClick: actions.collect,
      });
    }
    if (canCollectSingle) {
      primaries.push({
        label: spaMode ? "完成服務並收費" : "收款並完成服務",
        onClick: actions.collectSingle,
      });
    }
    // 體驗／單次尚未收款時不得繞過金流直接完成；收款 modal 會在同一
    // transaction 完成兩件事。已提前收款者才保留單獨「完成服務」。
    if (!canCollect && !canCollectSingle) {
      primaries.push({
        label:
          spaMode && booking.bookingType === "PACKAGE_SESSION"
            ? "完成服務並扣次"
            : !spaMode && booking.bookingType === "PACKAGE_SESSION" && !booking.isMakeup
              ? "完成服務並扣堂"
              : "完成服務",
        onClick: actions.complete,
      });
    }
    if (canCorrect) {
      secondaries.push({
        label: "收款更正",
        onClick: actions.correct,
        tone: "danger",
      });
    }
    if (canAdjustCheckout && !spaMode) {
      secondaries.push({ label: "補選方案", onClick: actions.adjustCheckout });
    }
    if (canAdjustToSingle && !spaMode) {
      secondaries.push({ label: "改為單次", onClick: actions.adjustToSingle });
    }
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "未到", onClick: actions.noShow });
    secondaries.push({
      label: "取消預約",
      onClick: actions.cancel,
      tone: "danger",
    });
  } else if (status === "COMPLETED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "NO_SHOW") {
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "CANCELLED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  }

  return (
    <div className={`shrink-0 border-t border-earth-200 bg-earth-50 px-4 py-3 ${spaMode ? "" : ["PENDING", "CONFIRMED"].includes(status) ? "min-h-[116px]" : "min-h-[76px]"}`}>
      {primaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {primaries.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={isActing}
              className={`inline-flex ${spaMode ? "h-9" : "min-h-11"} flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                i === 0
                  ? "bg-primary-600 text-white hover:bg-primary-700"
                  : "border border-primary-300 bg-white text-primary-700 hover:bg-primary-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {rebookHref && !spaMode ? (
          <Link
            href={rebookHref}
            className="inline-flex h-8 items-center rounded-md border border-primary-200 bg-white px-3 text-xs font-medium text-primary-700 hover:bg-primary-50"
          >
            再約下一次
          </Link>
        ) : null}
        {secondaries.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={isActing}
            className={`inline-flex ${spaMode ? "h-8 text-xs" : "min-h-11 text-sm"} items-center rounded-md border px-3 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              a.tone === "danger"
                ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                : "border-earth-300 bg-white text-earth-700 hover:bg-earth-50"
            }`}
          >
            {a.label}
          </button>
        ))}

      </div>
    </div>
  );
}

// ============================================================
// small presentational helpers
// ============================================================

function Section({
  title,
  children,
  readable = false,
}: {
  title: string;
  children: React.ReactNode;
  readable?: boolean;
}) {
  return (
    <div className={readable ? "min-w-0 border-b border-earth-100 px-4 py-2" : "border-b border-earth-100 px-4 py-3"}>
      <h3 className={readable ? "mb-2 text-base font-semibold text-earth-800" : "mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500"}>
        {title}
      </h3>
      <div className={readable ? "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5" : "grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"}>
        {children}
      </div>
    </div>
  );
}

function KV({
  readable = false,
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  readable?: boolean;
}) {
  return (
    <>
      <div className={readable ? "text-sm leading-6 text-earth-600" : "min-w-[4.5rem] text-xs text-earth-500"}>{label}</div>
      <div className={readable ? "flex min-w-0 items-start text-base leading-6 text-earth-800" : "flex items-center text-sm text-earth-800"}>
        {icon}
        <span className={readable ? "min-w-0 whitespace-pre-wrap break-words" : "min-w-0 truncate"}>{value}</span>
      </div>
    </>
  );
}

function DrawerSkeleton({
  onClose,
  error,
}: {
  onClose: () => void;
  error: string | null;
}) {
  return (
    <>
      <div className="flex items-start justify-between border-b border-earth-200 px-4 py-3">
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 animate-pulse rounded bg-earth-100" />
          <div className="h-6 w-24 animate-pulse rounded bg-earth-100" />
          <div className="h-4 w-28 animate-pulse rounded bg-earth-100" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-md border border-earth-100 bg-earth-50"
            />
          ))
        )}
      </div>
    </>
  );
}

// ============================================================
// pure helpers
// ============================================================

function formatBookingType(booking: BookingDrawerPayload["booking"]): string {
  if (booking.isMakeup) return "補課";
  switch (booking.bookingType) {
    case "FIRST_TRIAL":
      return "首次體驗";
    case "SINGLE":
      return "單次";
    case "PACKAGE_SESSION":
      return "套餐扣堂";
    default:
      return booking.bookingType;
  }
}

function computeEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}（${formatWeekdayZh(iso)}）`;
}
