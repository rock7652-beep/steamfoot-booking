"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidWalletSession } from "@/server/actions/wallet";

interface Props {
  sessionId: string;
  sessionNo: number;
  walletPlanName: string;
}

export function VoidSessionButton({ sessionId, sessionNo, walletPlanName }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (pending) return;
    setOpen(false);
    setReason("");
  }

  function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("請填寫註銷原因");
      return;
    }
    startTransition(async () => {
      const res = await voidWalletSession({ sessionId, reason: trimmed });
      if (res.success) {
        toast.success(`已註銷第 ${sessionNo} 堂`);
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.error ?? "註銷失敗");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-earth-300 bg-white px-2 py-0.5 text-[11px] font-medium text-earth-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        註銷此堂
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold text-earth-900">
              註銷第 {sessionNo} 堂？
            </h3>

            <div className="mb-4 space-y-1.5 rounded-lg bg-earth-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-earth-500">方案</span>
                <span className="text-earth-800">{walletPlanName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-earth-500">堂次</span>
                <span className="text-earth-800">第 {sessionNo} 堂</span>
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-earth-600">
              註銷原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="例：顧客退費 / 補償調整 / 系統補登"
              className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            />

            <p className="mt-3 mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              提醒：註銷後堂數會立即減少，且不可復原。本操作不會自動退費——退費請另行處理。
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={close}
                disabled={pending}
                className="rounded-lg bg-earth-100 px-4 py-2 text-sm text-earth-600 hover:bg-earth-200 disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? "處理中..." : "確認註銷"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
