"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { StatusBadge, bookingStatusMeta } from "@/components/admin/status-badge";
import {
  fetchBookingDetail,
  type BookingDrawerPayload,
} from "@/server/actions/booking-drawer";
import type { BookingDetailCache } from "./booking-detail-cache";
import {
  markCompleted,
  markNoShow,
  cancelBooking,
  revertBookingStatus,
  updateBooking,
} from "@/server/actions/booking";
import { NoShowModal, type NoShowChoice } from "./no-show-modal";
import { RescheduleModal } from "./reschedule-modal";
import { CollectTrialModal } from "./collect-trial-modal";
import { CorrectTrialCollectionModal } from "./correct-trial-collection-modal";
import { AttendanceModal } from "./attendance-modal";
import { CollectSingleModal } from "./collect-single-modal";
import { AdjustCheckoutModal } from "./adjust-checkout-modal";
import { computeAmount, resolveTrialDisplayAmount } from "./compute-amount";
import { PeopleBadge } from "./people-badge";
import { formatWeekdayZh } from "@/lib/date-utils";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "現金",
  TRANSFER: "轉帳",
  LINE_PAY: "LINE Pay",
  CREDIT_CARD: "信用卡",
  OTHER: "其他",
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
 * **僅限唯讀顯示** —— 收款 / 完成 / 改時間 / 取消 / 調整結帳等操作一律等
 * fetchBookingDetail 的 authoritative payload，絕不依賴此 prefill 啟用。
 */
export interface BookingPrefill {
  id: string;
  bookingDate: string; // YYYY-MM-DD
  slotTime: string;
  bookingStatus: string;
  bookingType: string;
  isMakeup: boolean;
  isCheckedIn: boolean;
  people: number;
  /** PR-3d：實際到店人數（FIRST_TRIAL；null = 未記錄／全到）。 */
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
}

interface BookingDetailDrawerProps {
  open: boolean;
  bookingId: string | null;
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
   * `newStatus` is the optimistic next state — parent uses it to update
   * cached month / day data without refetching the whole month.
   */
  onUpdated?: (bookingId: string, newStatus: string | null) => void;
  readOnly?: boolean;
}

export function BookingDetailDrawer({
  open,
  bookingId,
  summary,
  prefill,
  cache,
  onClose,
  onUpdated,
  readOnly = false,
}: BookingDetailDrawerProps) {
  const [data, setData] = useState<BookingDrawerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, startAction] = useTransition();
  const [noShowOpen, setNoShowOpen] = useState(false);
  // PR-3d：實際到店人數 modal — FIRST_TRIAL 且 people > 1。
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
    setData(cache?.get(bookingId) ?? null);
    setError(null);
    setPendingAttendedPeople(null);
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
    if (!open || !bookingId) return;
    const id = bookingId;
    let canceled = false;
    const promise = cache ? cache.load(id) : fetchBookingDetail(id);
    promise
      .then((payload) => {
        if (canceled) return;
        setData(payload);
        setError(null);
      })
      .catch((e) => {
        if (canceled) return;
        // 已有可顯示資料（cache）時，背景 revalidate 失敗不蓋畫面；否則才顯示錯誤。
        if (!cache?.get(id)) setError(e?.message ?? "載入失敗");
      });
    return () => {
      canceled = true;
    };
  }, [open, bookingId, reloadNonce, cache]);

  /**
   * Run a drawer action. Updates local drawer state optimistically with
   * `nextStatus` so the user sees the new status immediately, and notifies
   * the parent so it can patch its cached month/day data. We deliberately
   * **don't** call `router.refresh()` — the booking server actions already
   * `revalidatePath('/dashboard/bookings')`, so the data cache is invalidated
   * and next navigation pulls fresh data; in the meantime the calendar's
   * lifted state stays in sync via `onUpdated`.
   */
  function wrapAction(
    label: string,
    action: () => Promise<{ success: boolean; error?: string } | unknown>,
    nextStatus: string | null,
    opts?: { onSuccess?: () => void },
  ) {
    if (!bookingId) return;
    if (readOnly) {
      toast.error("查看模式下不可操作預約");
      return;
    }
    const id = bookingId;
    startAction(async () => {
      try {
        const result = (await action()) as
          | { success: boolean; error?: string }
          | undefined;
        if (result && result.success === false) {
          toast.error(result.error ?? "操作失敗");
          return;
        }
        toast.success(label);
        opts?.onSuccess?.();

        if (nextStatus) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  booking: {
                    ...prev.booking,
                    bookingStatus: nextStatus,
                    isCheckedIn:
                      nextStatus === "COMPLETED" ? true : prev.booking.isCheckedIn,
                  },
                }
              : prev,
          );
        }

        onUpdated?.(id, nextStatus);
        // parent 已 invalidate 此 booking 的 cache（C）；bump nonce 讓 effect
        // 重跑，取消任何過期 in-flight revalidate 並重抓 authoritative payload。
        setReloadNonce((n) => n + 1);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "操作失敗";
        toast.error(msg);
      }
    });
  }

  // 收款入口（flow pivot）：FIRST_TRIAL + people > 1 + 尚未確認實到人數 →
  // 先問 AttendanceModal（intent="collect"）；其餘狀況直接開 CollectTrialModal。
  // people=1 或已存 attendedPeople（如 完成服務 fallback 已寫入後再點收款）→
  // 不重問，直接收款。
  function handleCollect() {
    const b = data?.booking;
    if (readOnly) return;
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

  // 完成服務入口：若 attendedPeople 已存（多半是收款入口寫入過）→ 直接完成服務，
  // 不重問。否則 FIRST_TRIAL + people > 1 仍以 AttendanceModal fallback 詢問
  //（涵蓋未走收款路徑直接完成服務的情境）。
  function handleComplete() {
    const b = data?.booking;
    if (readOnly) return;
    if (
      b &&
      b.bookingType === "FIRST_TRIAL" &&
      b.people > 1 &&
      b.attendedPeople == null &&
      (b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED")
    ) {
      setAttendanceIntent("complete");
      setAttendanceOpen(true);
      return;
    }
    wrapAction("已完成服務", () => markCompleted(bookingId!), "COMPLETED");
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
        () => markNoShow(bookingId, "DEDUCTED"),
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
    // intent === "complete"（或 fallback）：直接完成服務，markCompleted 寫 DB。
    wrapAction(
      "已完成服務",
      () => markCompleted(bookingId, { attendedPeople }),
      "COMPLETED",
      {
        onSuccess: () => {
          setAttendanceOpen(false);
          setAttendanceIntent(null);
        },
      },
    );
  }

  function handleNoShowConfirm(choice: NoShowChoice) {
    if (readOnly) return;
    const makeupPeople =
      data?.booking.makeupCreditLinks?.length ?? (data?.booking.isMakeup ? 1 : 0);
    const walletPeople = data?.booking.walletSessions?.length ?? 0;
    // 整筆補課未到：server 不扣堂、不發券，toast 不可說「扣堂並發補課」。
    const isFullMakeupBooking =
      (data?.booking.isMakeup ?? false) && makeupPeople > 0 && walletPeople === 0;
    const labelMap: Record<NoShowChoice, string> = {
      DEDUCTED: "已標記未到並扣堂",
      DEDUCTED_WITH_MAKEUP: "已標記未到、扣堂並發補課",
    };
    const label = isFullMakeupBooking ? "已標記未到" : labelMap[choice];
    wrapAction(
      label,
      () => markNoShow(bookingId!, choice),
      "NO_SHOW",
      { onSuccess: () => setNoShowOpen(false) },
    );
  }

  function handleRescheduleConfirm(newDate: string, newSlotTime: string) {
    if (readOnly) return;
    // Reschedule moves the booking across days — the parent needs to
    // re-fetch the day panel rather than patch in place. We pass `null`
    // for nextStatus so the parent treats this as "needs day refresh".
    wrapAction(
      "已改期",
      () =>
        updateBooking(bookingId!, { bookingDate: newDate, slotTime: newSlotTime }),
      null,
      { onSuccess: () => setRescheduleOpen(false) },
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
    wrapAction("已還原狀態", () => revertBookingStatus(bookingId!), "PENDING");
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
    if (bookingId) onUpdated?.(bookingId, serviceCompleted ? "COMPLETED" : null);
  }

  // 單次（SINGLE，不扣堂）收款成功 — 同 trial 行為：重抓 detail 翻成
  // 「已收款」，並通知母層當日資料重整。
  function handleSingleCollected(serviceCompleted: boolean) {
    setCollectSingleOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId) onUpdated?.(bookingId, serviceCompleted ? "COMPLETED" : null);
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

  // 調整結帳方式 Mode B 成功（PACKAGE_SESSION → SINGLE）— bookingType / wallet 翻轉，
  // 預約狀態不變。重抓 detail 讓 Drawer 改顯示單次未收款；onUpdated(null) 讓母層
  // 重整當日資料（月曆 strip 的方案標籤一併更新）。
  function handleAdjustedToSingle() {
    setAdjustToSingleOpen(false);
    setReloadNonce((n) => n + 1);
    if (bookingId) onUpdated?.(bookingId, null);
  }

  // What we have to render (priority):
  //   1. Full payload matching current bookingId — preferred when loaded (from
  //      fetch or cache). Only this enables the action footer.
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
        open={open}
        onClose={onClose}
        labelledById="booking-drawer-title"
      >
        {hasFullData && data ? (
          <DrawerContent
            payload={data}
            isActing={isActing}
            onClose={onClose}
            readOnly={readOnly}
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
        ) : showPrefill && prefill ? (
          <PrefillDrawerContent
            prefill={prefill}
            loading={loading}
            error={error}
            onClose={onClose}
          />
        ) : showHeaderFromSummary && summary ? (
          <SummaryDrawerContent
            summary={summary}
            loading={loading}
            error={error}
            onClose={onClose}
          />
        ) : (
          <DrawerSkeleton onClose={onClose} error={error} />
        )}
      </RightSheet>
      {!readOnly && (
      <NoShowModal
        open={noShowOpen && !!data}
        onClose={() => setNoShowOpen(false)}
        onConfirm={handleNoShowConfirm}
        loading={isActing}
        isMakeup={
          (data?.booking.isMakeup ?? false) &&
          (data?.booking.makeupCreditLinks?.length ?? 0) > 0 &&
          (data?.booking.walletSessions?.length ?? 0) === 0
        }
      />
      )}
      {!readOnly && data && data.booking.bookingType === "FIRST_TRIAL" && data.booking.people > 1 && (
        <AttendanceModal
          open={attendanceOpen}
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
          open={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          currentDate={data.booking.bookingDate}
          currentSlotTime={data.booking.slotTime}
          people={data.booking.people}
          onConfirm={handleRescheduleConfirm}
          loading={isActing}
        />
      )}
      {!readOnly && data && data.trial && !data.trial.collected && (
        <CollectTrialModal
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
          attendedPeople={
            pendingAttendedPeople ?? data.booking.attendedPeople
          }
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
      {!readOnly && data && data.single && !data.single.collected && (
        <CollectSingleModal
          open={collectSingleOpen}
          onClose={() => setCollectSingleOpen(false)}
          bookingId={data.booking.id}
          customerName={data.booking.customer.name}
          dateLabel={`${data.booking.bookingDate} ${data.booking.slotTime}`}
          defaultPrice={data.single.defaultPrice}
          onCollected={handleSingleCollected}
        />
      )}
      {!readOnly && data && data.checkout && data.checkout.canAdjustToPackage && (
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
  isActing,
  onClose,
  actions,
  readOnly = false,
}: {
  payload: BookingDrawerPayload;
  isActing: boolean;
  onClose: () => void;
  actions: DrawerActions;
  readOnly?: boolean;
}) {
  const { booking, customerSummary, trial, single, checkout, checkoutToSingle } =
    payload;
  const meta = bookingStatusMeta(booking.bookingStatus, booking.isCheckedIn);
  const amount = computeAmount(booking, trial);
  const duration = booking.servicePlan?.category === "TRIAL" ? 30 : 60;
  const endTime = computeEndTime(booking.slotTime, duration);
  const dateLabel = formatDateLabel(booking.bookingDate);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {booking.bookingDate.slice(5).replace("-", "/")} {booking.slotTime}
            </span>
          </div>
          <h2
            id="booking-drawer-title"
            className="mt-1 truncate text-lg font-bold text-earth-900"
          >
            {booking.customer.name}
            {booking.people > 1 && <PeopleBadge people={booking.people} />}
          </h2>
          <p className="mt-0.5 truncate text-sm text-earth-500">
            {booking.isMakeup
              ? "補課 · "
              : booking.servicePlan?.name
                ? `${booking.servicePlan.name} · `
                : ""}
            {duration} 分鐘
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
      <div className="flex-1 overflow-y-auto">
        {/* Section A: 預約資訊 */}
        <Section title="預約資訊">
          <KV label="日期" value={dateLabel} />
          <KV
            label="時間"
            value={
              <span className="tabular-nums">
                {booking.slotTime} - {endTime}
              </span>
            }
          />
          <KV
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
              <KV
                label="值班店長"
                value={booking.serviceStaff.displayName}
              />
            )}
          <KV
            label="服務"
            value={
              booking.isMakeup
                ? "補課"
                : (booking.servicePlan?.name ?? "—")
            }
          />
          <KV label="人數" value={`${booking.people} 人`} />
          {booking.attendedPeople != null &&
            booking.attendedPeople < booking.people && (
              <KV
                label="實際到店"
                value={`${booking.attendedPeople} / ${booking.people} 人`}
              />
            )}
          <KV label="金額" value={amount} />
        </Section>

        {/* Section B: 顧客資訊 */}
        <Section title="顧客資訊">
          <KV label="姓名" value={booking.customer.name} />
          <KV
            label="電話"
            value={
              booking.customer.phone ? (
                <a
                  href={`tel:${booking.customer.phone}`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {booking.customer.phone}
                </a>
              ) : (
                "—"
              )
            }
          />
          {booking.customer.serviceNote ? (
            <KV
              label="服務備註"
              value={
                <span className="whitespace-pre-wrap text-amber-800">
                  {booking.customer.serviceNote}
                </span>
              }
            />
          ) : null}
          <KV
            label="累積完成"
            value={`${customerSummary.totalBookings} 次`}
          />
          <KV
            label="最近到店"
            value={
              customerSummary.lastVisit
                ? customerSummary.lastVisit
                : customerSummary.isNewCustomer
                  ? "（新客）"
                  : "—"
            }
          />
          <div className="col-span-2 mt-1 flex gap-2">
            <Link
              href={`/dashboard/customers/${booking.customer.id}`}
              className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              查看顧客資料
            </Link>
            <Link
              href={`/dashboard/customers/${booking.customer.id}#bookings`}
              className="inline-flex h-7 items-center rounded-md border border-earth-300 bg-white px-3 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              查看歷史預約
            </Link>
          </div>
        </Section>

        {/* Section C: 方案 / 付款 */}
        <Section title="方案 / 付款">
          <KV label="類型" value={formatBookingType(booking)} />
          <KV
            label="方案"
            value={
              booking.customerPlanWallet?.plan.name ??
              booking.servicePlan?.name ??
              "—"
            }
          />
          {booking.customerPlanWallet && (
            <KV
              label="套餐剩餘"
              value={`${booking.customerPlanWallet.remainingSessions} / ${booking.customerPlanWallet.totalSessions} 堂`}
            />
          )}
          <KV
            label="付款狀態"
            value={
              booking.isMakeup
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
          {trial && trial.collected && (
            <>
              <KV
                label="付款方式"
                value={
                  trial.collectedMethod
                    ? (PAYMENT_METHOD_LABEL[trial.collectedMethod] ??
                      trial.collectedMethod)
                    : "—"
                }
              />
              <KV
                label="收款金額"
                value={
                  trial.collectedAmount == null
                    ? "—"
                    : `NT$ ${trial.collectedAmount.toLocaleString()}`
                }
              />
              {trial.collectedAt && (
                <KV label="收款日期" value={trial.collectedAt} />
              )}
            </>
          )}
          {single && single.collected && (
            <>
              <KV
                label="付款方式"
                value={
                  single.collectedMethod
                    ? (PAYMENT_METHOD_LABEL[single.collectedMethod] ??
                      single.collectedMethod)
                    : "—"
                }
              />
              <KV
                label="收款金額"
                value={
                  single.collectedAmount == null
                    ? "—"
                    : `NT$ ${single.collectedAmount.toLocaleString()}`
                }
              />
              {single.collectedDiscountAmount != null &&
                single.collectedDiscountAmount > 0 && (
                  <KV
                    label="折扣"
                    value={`NT$ ${single.collectedDiscountAmount.toLocaleString()}`}
                  />
                )}
              {single.collectedAt && (
                <KV label="收款日期" value={single.collectedAt} />
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
            <KV
              label="預計收款"
              value={`NT$ ${booking.expectedAmount.toLocaleString()}`}
            />
          )}
          {single && !single.collected && (
            <KV
              label="預計收款"
              value={`NT$ ${single.defaultPrice.toLocaleString()}`}
            />
          )}
        </Section>

        {/* Section D: 備註 */}
        {booking.notes && (
          <Section title="備註">
            <div className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-earth-700">
              {booking.notes}
            </div>
          </Section>
        )}
      </div>

      {/* Section E: Actions */}
      {readOnly ? (
        <div className="border-t border-earth-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          查看模式提供完整閱讀能力，完成服務、取消、收款與改期請由該店自行完成。
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
function SummaryDrawerContent({
  summary,
  loading,
  error,
  onClose,
}: {
  summary: BookingSummary;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const meta = bookingStatusMeta(summary.bookingStatus, false);
  const duration = summary.servicePlanCategory === "TRIAL" ? 30 : 60;

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {summary.bookingDate.slice(5).replace("-", "/")} {summary.slotTime}
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
              ? "補課 · "
              : summary.servicePlanName
                ? `${summary.servicePlanName} · `
                : ""}
            {duration} 分鐘
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
              <p className="text-[11px] text-earth-400">載入詳細資料…</p>
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
  loading,
  error,
  onClose,
}: {
  prefill: BookingPrefill;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const meta = bookingStatusMeta(prefill.bookingStatus, prefill.isCheckedIn);
  const duration = prefill.bookingType === "FIRST_TRIAL" ? 30 : 60;
  const endTime = computeEndTime(prefill.slotTime, duration);
  const dateLabel = formatDateLabel(prefill.bookingDate);
  const amount = prefillAmount(prefill);
  const showServiceStaff =
    !!prefill.serviceStaffName &&
    prefill.serviceStaffName !== prefill.revenueStaff?.displayName;

  return (
    <>
      {/* Header — 與完整抽屜同一條 band */}
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>
            <span className="text-sm font-semibold tabular-nums text-earth-700">
              {prefill.bookingDate.slice(5).replace("-", "/")} {prefill.slotTime}
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
              ? "補課 · "
              : prefill.servicePlanName
                ? `${prefill.servicePlanName} · `
                : ""}
            {duration} 分鐘
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
                {prefill.slotTime} - {endTime}
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
            value={prefill.isMakeup ? "補課" : (prefill.servicePlanName ?? "—")}
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
            <p className="text-[11px] text-earth-400">完整資料載入中…</p>
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
}: {
  booking: BookingDrawerPayload["booking"];
  trial: BookingDrawerPayload["trial"];
  single: BookingDrawerPayload["single"];
  checkout: BookingDrawerPayload["checkout"];
  checkoutToSingle: BookingDrawerPayload["checkoutToSingle"];
  isActing: boolean;
  actions: DrawerActions;
}) {
  const status = booking.bookingStatus;
  const primaries: Array<{ label: string; onClick: () => void }> = [];
  const secondaries: Array<{ label: string; onClick: () => void; tone?: "danger" }> = [];

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

  // 調整結帳方式 Mode B（PACKAGE_SESSION 方案扣堂 → SINGLE 單次未收款）：server
  // 已用同源 guard 判定 canAdjustToSingle；此處只呈現次要動線。與 Mode A 互斥
  // （預約非 SINGLE 即 PACKAGE_SESSION），不會同時出現兩顆「調整結帳」。
  const canAdjustToSingle =
    checkoutToSingle != null &&
    checkoutToSingle.canAdjustToSingle &&
    (status === "PENDING" || status === "CONFIRMED");

  if (status === "PENDING" || status === "CONFIRMED") {
    if (canCollect) {
      primaries.push({ label: "收款並完成服務", onClick: actions.collect });
    }
    if (canCollectSingle) {
      primaries.push({ label: "收款並完成服務", onClick: actions.collectSingle });
    }
    // 體驗／單次尚未收款時不得繞過金流直接完成；收款 modal 會在同一
    // transaction 完成兩件事。已提前收款者才保留單獨「完成服務」。
    if (!canCollect && !canCollectSingle) {
      primaries.push({ label: "完成服務", onClick: actions.complete });
    }
    if (canCorrect) {
      secondaries.push({
        label: "收款更正",
        onClick: actions.correct,
        tone: "danger",
      });
    }
    if (canAdjustCheckout) {
      secondaries.push({ label: "調整結帳", onClick: actions.adjustCheckout });
    }
    if (canAdjustToSingle) {
      secondaries.push({ label: "調整結帳", onClick: actions.adjustToSingle });
    }
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "標記未到", onClick: actions.noShow });
    secondaries.push({ label: "取消預約", onClick: actions.cancel, tone: "danger" });
  } else if (status === "COMPLETED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "NO_SHOW") {
    secondaries.push({ label: "改時間", onClick: actions.reschedule });
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  } else if (status === "CANCELLED") {
    secondaries.push({ label: "還原狀態", onClick: actions.revert });
  }

  return (
    <div className="border-t border-earth-200 bg-earth-50 px-4 py-3">
      {primaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {primaries.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={isActing}
              className={`inline-flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
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
        {secondaries.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={isActing}
            className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              a.tone === "danger"
                ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                : "border-earth-300 bg-white text-earth-700 hover:bg-earth-50"
            }`}
          >
            {a.label}
          </button>
        ))}
        <div className="ml-auto">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="inline-flex h-8 items-center text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            完整頁面 →
          </Link>
        </div>
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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-earth-100 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-earth-500">
        {title}
      </h3>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
        {children}
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <div className="min-w-[4.5rem] text-xs text-earth-500">{label}</div>
      <div className="flex items-center text-sm text-earth-800">
        {icon}
        <span className="min-w-0 truncate">{value}</span>
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
