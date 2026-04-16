"use client";

import { useTransition } from "react";
import { toast } from "sonner";

interface NoShowButtonProps {
  isMakeup: boolean;
  action: () => Promise<void>;
}

export function NoShowButton({ isMakeup, action }: NoShowButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const msg = isMakeup
      ? "確定標記未到？補課的未到不會再產生新的補課資格。"
      : "確定標記未到？已預扣堂數不會退回，但會自動產生一次補課資格。";
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        await action();
        toast.success("已標記未到");
      } catch (e) {
        console.error("[booking] markNoShow failed:", e);
        toast.error(e instanceof Error ? e.message : "標記未到失敗，請重試");
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

interface CancelButtonProps {
  isMakeup: boolean;
  action: (note?: string) => Promise<void>;
}

export function CancelButton({ isMakeup, action }: CancelButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const msg = isMakeup
      ? "確定取消？補課資格將退回。"
      : "確定取消？已預扣堂數將退回。";
    if (!confirm(msg)) return;

    const formData = new FormData(e.currentTarget);
    const note = formData.get("note") as string | undefined;
    startTransition(async () => {
      try {
        await action(note ?? undefined);
        toast.success("預約已取消");
      } catch (e) {
        console.error("[booking] cancel failed:", e);
        toast.error(e instanceof Error ? e.message : "取消預約失敗，請重試");
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

interface RevertButtonProps {
  status: string;
  action: () => Promise<void>;
}

export function RevertButton({ status, action }: RevertButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const msg = REVERT_MSG[status] ?? "確定回退此預約？";
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        await action();
        toast.success("預約狀態已回退");
      } catch (e) {
        console.error("[booking] revert failed:", e);
        toast.error(e instanceof Error ? e.message : "回退失敗，請重試");
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
