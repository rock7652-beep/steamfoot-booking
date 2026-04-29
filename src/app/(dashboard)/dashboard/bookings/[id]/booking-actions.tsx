"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  markCompleted,
  checkInBooking,
  markNoShow,
  cancelBooking,
  revertBookingStatus,
} from "@/server/actions/booking";

// Each button calls the server action directly and inspects ActionResult,
// so business-rule failures (e.g. PR #76: PACKAGE_SESSION 無方案 → BUSINESS_RULE)
// surface as toast, not Next.js red box. router.refresh() refreshes the RSC
// data in place, so the page stays put — no redirect to other pages.

interface BaseProps {
  bookingId: string;
}

export function CheckInButton({ bookingId }: BaseProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await checkInBooking(bookingId);
      if (r.success) {
        toast.success("已報到");
        router.refresh();
      } else {
        toast.error(r.error ?? "報到失敗");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {isPending ? "處理中..." : "報到"}
    </button>
  );
}

interface CompleteButtonProps extends BaseProps {
  isMakeup: boolean;
}

export function CompleteButton({ bookingId, isMakeup }: CompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const r = await markCompleted(bookingId);
      if (r.success) {
        toast.success("已標記完成");
        router.refresh();
      } else {
        toast.error(r.error ?? "標記完成失敗");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {isPending ? "處理中..." : isMakeup ? "標記完成" : "標記完成（已預扣堂數）"}
    </button>
  );
}

interface NoShowButtonProps extends BaseProps {
  isMakeup: boolean;
}

export function NoShowButton({ bookingId, isMakeup }: NoShowButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const msg = isMakeup
      ? "確定標記未到？補課的未到不會再產生新的補課資格。"
      : "確定標記未到？已預扣堂數不會退回，但會自動產生一次補課資格。";
    if (!confirm(msg)) return;
    startTransition(async () => {
      const r = await markNoShow(bookingId);
      if (r.success) {
        toast.success("已標記未到");
        router.refresh();
      } else {
        toast.error(r.error ?? "標記未到失敗");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-gray-300 disabled:opacity-50"
    >
      {isPending ? "處理中..." : "未到"}
    </button>
  );
}

interface CancelButtonProps extends BaseProps {
  isMakeup: boolean;
}

export function CancelButton({ bookingId, isMakeup }: CancelButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const msg = isMakeup
      ? "確定取消？補課資格將退回。"
      : "確定取消？已預扣堂數將退回。";
    if (!confirm(msg)) return;

    const formData = new FormData(e.currentTarget);
    const note = (formData.get("note") as string | null) ?? undefined;
    startTransition(async () => {
      const r = await cancelBooking(bookingId, note);
      if (r.success) {
        toast.success("預約已取消");
        router.refresh();
      } else {
        toast.error(r.error ?? "取消預約失敗");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        name="note"
        placeholder="取消原因（選填）"
        className="rounded-lg border border-earth-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
      >
        {isPending ? "處理中..." : "取消預約"}
      </button>
    </form>
  );
}

const REVERT_MSG: Record<string, string> = {
  COMPLETED: "確定回退？已扣堂數將還原，狀態改回「待確認」。",
  NO_SHOW: "確定回退？扣堂（若有）將還原並移除補課資格，狀態改回「待確認」。",
  CANCELLED: "確定回退？預約將恢復，狀態改回「待確認」。",
};

interface RevertButtonProps extends BaseProps {
  status: string;
}

export function RevertButton({ bookingId, status }: RevertButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const msg = REVERT_MSG[status] ?? "確定回退此預約？";
    if (!confirm(msg)) return;
    startTransition(async () => {
      const r = await revertBookingStatus(bookingId);
      if (r.success) {
        toast.success("預約狀態已回退");
        router.refresh();
      } else {
        toast.error(r.error ?? "回退失敗");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50"
    >
      {isPending ? "處理中..." : "回退狀態"}
    </button>
  );
}
