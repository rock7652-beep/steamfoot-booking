"use client";

import { useActionState } from "react";
import { checkInBooking, markCompleted, markNoShow, cancelBooking } from "@/server/actions/booking";

interface Props {
  bookingId: string;
  status: string;
  isCheckedIn: boolean;
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

export function BookingQuickActions({ bookingId, status, isCheckedIn }: Props) {
  const [checkInState, checkInAction, checkInPending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await checkInBooking(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error, done: false };
    },
    { error: null, done: false }
  );

  const [completeState, completeAction, completePending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await markCompleted(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error, done: false };
    },
    { error: null, done: false }
  );

  const [noShowState, noShowAction, noShowPending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await markNoShow(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error, done: false };
    },
    { error: null, done: false }
  );

  const [cancelState, cancelAction, cancelPending] = useActionState(
    async (): Promise<ActionState> => {
      const r = await cancelBooking(bookingId);
      return r.success ? { error: null, done: true } : { error: r.error, done: false };
    },
    { error: null, done: false }
  );

  const anyDone = checkInState.done || completeState.done || noShowState.done || cancelState.done;
  const anyError = checkInState.error || completeState.error || noShowState.error || cancelState.error;

  if (anyDone) {
    return <span className="text-[10px] text-green-600 font-medium">✓ 已更新</span>;
  }

  // 已完成或未到 → 不顯示操作
  if (status === "COMPLETED" || status === "NO_SHOW" || status === "CANCELLED") {
    return null;
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
      {anyError && (
        <span className="text-[9px] text-red-500 max-w-[80px] truncate" title={anyError}>
          {anyError}
        </span>
      )}

      {/* CONFIRMED 且尚未報到 → 報到 */}
      {status === "CONFIRMED" && !isCheckedIn && (
        <ActionButton
          label="報到"
          onClick={() => checkInAction()}
          pending={checkInPending}
          color="blue"
        />
      )}

      {/* 已報到 → 完成 */}
      {(status === "CONFIRMED" && isCheckedIn) && (
        <ActionButton
          label="完成"
          onClick={() => completeAction()}
          pending={completePending}
          color="green"
        />
      )}

      {/* 未到 */}
      {(status === "CONFIRMED" || status === "PENDING") && (
        <ActionButton
          label="未到"
          onClick={() => noShowAction()}
          pending={noShowPending}
          color="yellow"
          confirmMsg="確定標記為未到？"
        />
      )}

      {/* 取消 */}
      {(status === "CONFIRMED" || status === "PENDING") && (
        <ActionButton
          label="取消"
          onClick={() => cancelAction()}
          pending={cancelPending}
          color="red"
          confirmMsg="確定取消此預約？"
        />
      )}
    </div>
  );
}
