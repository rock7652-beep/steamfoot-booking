"use client";

import { useState, useActionState } from "react";
import { markCompleted, markNoShow, cancelBooking } from "@/server/actions/booking";
import type { NoShowPolicy } from "@/lib/booking-constants";

interface Props {
  bookingId: string;
  status: string;
  isCheckedIn: boolean; // 保留 prop 相容，但不再使用
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
  color: "green" | "blue" | "red" | "yellow";
  confirmMsg?: string;
}) {
  const colorMap = {
    green: "bg-green-50 text-green-700 hover:bg-green-100",
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
    yellow: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
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

export function BookingQuickActions({ bookingId, status }: Props) {
  const [showNoShowMenu, setShowNoShowMenu] = useState(false);

  const [completeState, completeAction, completePending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await markCompleted(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error ?? "操作失敗", done: false };
    },
    { error: null, done: false }
  );

  const [noShowState, setNoShowState] = useState<ActionState>({ error: null, done: false });
  const [noShowPending, setNoShowPending] = useState(false);

  const [cancelState, cancelAction, cancelPending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await cancelBooking(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error ?? "操作失敗", done: false };
    },
    { error: null, done: false }
  );

  async function handleNoShow(policy: NoShowPolicy) {
    setNoShowPending(true);
    setShowNoShowMenu(false);
    try {
      const r = await markNoShow(bookingId, policy);
      setNoShowState(r.success ? { error: null, done: true } : { error: r.error ?? "操作失敗", done: false });
    } catch {
      setNoShowState({ error: "操作失敗", done: false });
    } finally {
      setNoShowPending(false);
    }
  }

  const anyDone = completeState.done || noShowState.done || cancelState.done;
  const anyError = completeState.error || noShowState.error || cancelState.error;

  if (anyDone) {
    return <span className="text-[10px] text-green-600 font-medium">✓ 已更新</span>;
  }

  // 已完成或未到 → 不顯示操作
  if (status === "COMPLETED" || status === "NO_SHOW" || status === "CANCELLED") {
    return null;
  }

  return (
    <div className="relative flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      {anyError && (
        <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={anyError}>
          {anyError}
        </span>
      )}

      {/* 出席（PENDING / CONFIRMED → COMPLETED） */}
      <ActionButton
        label="出席"
        onClick={() => completeAction()}
        pending={completePending}
        color="green"
      />

      {/* 未到 — 點擊展開扣堂選單 */}
      <div className="relative">
        <ActionButton
          label="未到"
          onClick={() => setShowNoShowMenu(!showNoShowMenu)}
          pending={noShowPending}
          color="yellow"
        />
        {showNoShowMenu && (
          <>
            {/* 背景遮罩（點擊關閉） */}
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => { e.stopPropagation(); setShowNoShowMenu(false); }}
            />
            {/* Popover 選單 */}
            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-earth-200 bg-white p-1.5 shadow-lg">
              <p className="mb-1 px-1.5 text-[9px] font-medium text-earth-400">扣堂方式</p>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleNoShow("DEDUCTED"); }}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-earth-700 hover:bg-red-50 hover:text-red-700 transition"
              >
                <span className="text-red-500">✗</span>
                扣堂（照常扣）
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleNoShow("NOT_DEDUCTED"); }}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-earth-700 hover:bg-amber-50 hover:text-amber-700 transition"
              >
                <span className="text-amber-500">↩</span>
                不扣堂（給補課）
              </button>
            </div>
          </>
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
