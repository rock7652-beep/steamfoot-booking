"use client";

import { useState, useRef, useEffect, useActionState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { markCompleted, markNoShow, cancelBooking, revertBookingStatus } from "@/server/actions/booking";
import type { NoShowChoice } from "@/lib/booking-constants";

interface Props {
  bookingId: string;
  status: string;
  isCheckedIn: boolean; // 保留 prop 相容，但不再使用
  onOptimisticUpdate?: (newStatus: string) => void;
}

type ActionState = { error: string | null; done: boolean };

function ActionButton({
  label,
  onClick,
  pending,
  color,
  confirmMsg,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  color: "green" | "red" | "yellow" | "gray";
  confirmMsg?: string;
}) {
  const colorMap = {
    green: "bg-green-50 text-green-700 hover:bg-green-100",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
    yellow: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
    gray: "bg-earth-50 text-earth-600 hover:bg-earth-100",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirmMsg && !confirm(confirmMsg)) return;
    onClick();
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={`rounded-md px-2 py-1 text-[10px] font-medium transition disabled:opacity-50 ${colorMap[color]}`}
    >
      {pending ? "..." : label}
    </button>
  );
}

// ── Portal-based Popover for NoShow choices ──
function NoShowPopover({
  anchorRef,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (choice: NoShowChoice) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    // Position below the button, aligned to right edge
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 192), // 192 = w-48
    });
  }, [anchorRef]);

  return createPortal(
    <>
      {/* 背景遮罩（點擊關閉） */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      {/* Popover 選單 */}
      <div
        className="fixed z-[9999] w-48 rounded-lg border border-earth-200 bg-white py-1 shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="mb-0.5 px-3 pt-1 text-[10px] font-medium text-earth-400">
          未到處理方式
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect("DEDUCTED"); }}
          className="flex w-full items-start gap-2 px-3 py-2 text-left text-[11px] text-earth-700 hover:bg-red-50 transition"
        >
          <span className="mt-px text-red-500">✗</span>
          <div>
            <div className="font-medium">扣堂（照常扣）</div>
            <div className="text-[9px] text-earth-400">扣 1 堂、不給補課</div>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect("NOT_DEDUCTED_WITH_MAKEUP"); }}
          className="flex w-full items-start gap-2 px-3 py-2 text-left text-[11px] text-earth-700 hover:bg-amber-50 transition"
        >
          <span className="mt-px text-amber-500">↩</span>
          <div>
            <div className="font-medium">不扣堂＋給補課</div>
            <div className="text-[9px] text-earth-400">不扣堂、給 30 天補課資格</div>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect("NOT_DEDUCTED_NO_MAKEUP"); }}
          className="flex w-full items-start gap-2 px-3 py-2 text-left text-[11px] text-earth-700 hover:bg-earth-50 transition"
        >
          <span className="mt-px text-earth-400">—</span>
          <div>
            <div className="font-medium">不扣堂、不補課</div>
            <div className="text-[9px] text-earth-400">僅記錄未到、不做任何扣減</div>
          </div>
        </button>
      </div>
    </>,
    document.body
  );
}

export function BookingQuickActions({ bookingId, status, onOptimisticUpdate }: Props) {
  const [showNoShowMenu, setShowNoShowMenu] = useState(false);
  const noShowAnchorRef = useRef<HTMLDivElement>(null);

  const [completeState, completeAction, completePending] = useActionState(
    async (): Promise<ActionState> => {
      onOptimisticUpdate?.("COMPLETED");
      const r = await markCompleted(bookingId);
      if (r.success) {
        toast.success("已標記出席");
        return { error: null, done: true };
      }
      toast.error(r.error ?? "操作失敗");
      return { error: r.error ?? "操作失敗", done: false };
    },
    { error: null, done: false }
  );

  const [noShowState, setNoShowState] = useState<ActionState>({ error: null, done: false });
  const [noShowPending, setNoShowPending] = useState(false);

  const [cancelState, cancelAction, cancelPending] = useActionState(
    async (): Promise<ActionState> => {
      onOptimisticUpdate?.("CANCELLED");
      const r = await cancelBooking(bookingId);
      if (r.success) {
        toast.success("預約已取消");
        return { error: null, done: true };
      }
      toast.error(r.error ?? "操作失敗");
      return { error: r.error ?? "操作失敗", done: false };
    },
    { error: null, done: false }
  );

  // ── 修正（revert）狀態 ──
  const [revertState, setRevertState] = useState<ActionState>({ error: null, done: false });
  const [revertPending, setRevertPending] = useState(false);

  async function handleNoShow(choice: NoShowChoice) {
    setNoShowPending(true);
    setShowNoShowMenu(false);
    onOptimisticUpdate?.("NO_SHOW");
    try {
      const r = await markNoShow(bookingId, choice);
      if (r.success) {
        toast.success("已標記未到");
        setNoShowState({ error: null, done: true });
      } else {
        toast.error(r.error ?? "操作失敗");
        setNoShowState({ error: r.error ?? "操作失敗", done: false });
      }
    } catch {
      toast.error("操作失敗");
      setNoShowState({ error: "操作失敗", done: false });
    } finally {
      setNoShowPending(false);
    }
  }

  async function handleRevert() {
    setRevertPending(true);
    onOptimisticUpdate?.("PENDING");
    try {
      const r = await revertBookingStatus(bookingId);
      if (r.success) {
        toast.success("已恢復為待到店");
        setRevertState({ error: null, done: true });
      } else {
        toast.error(r.error ?? "操作失敗");
        setRevertState({ error: r.error ?? "操作失敗", done: false });
      }
    } catch {
      toast.error("操作失敗");
      setRevertState({ error: "操作失敗", done: false });
    } finally {
      setRevertPending(false);
    }
  }

  const anyError = completeState.error || noShowState.error || cancelState.error || revertState.error;

  // ── 終端狀態（COMPLETED / NO_SHOW / CANCELLED）→ 顯示「修正」按鈕 ──
  if (status === "COMPLETED" || status === "NO_SHOW" || status === "CANCELLED") {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
        {anyError && (
          <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={anyError}>
            {anyError}
          </span>
        )}
        <ActionButton
          label="修正"
          onClick={handleRevert}
          pending={revertPending}
          color="gray"
          confirmMsg={`確定要將此預約恢復為「待到店」？系統會自動回滾已扣堂數、使用紀錄及補課資格。`}
        />
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      {anyError && (
        <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={anyError}>
          {anyError}
        </span>
      )}

      {/* 出席 */}
      <ActionButton
        label="出席"
        onClick={() => completeAction()}
        pending={completePending}
        color="green"
      />

      {/* 未到 — 點擊展開處理方式選單（Portal） */}
      <div className="relative" ref={noShowAnchorRef}>
        <ActionButton
          label="未到"
          onClick={() => setShowNoShowMenu(!showNoShowMenu)}
          pending={noShowPending}
          color="yellow"
        />
        {showNoShowMenu && (
          <NoShowPopover
            anchorRef={noShowAnchorRef}
            onSelect={handleNoShow}
            onClose={() => setShowNoShowMenu(false)}
          />
        )}
      </div>

      {/* 取消 */}
      <ActionButton
        label="取消"
        onClick={() => cancelAction()}
        pending={cancelPending}
        color="red"
        confirmMsg="確定取消此預約？"
      />
    </div>
  );
}
