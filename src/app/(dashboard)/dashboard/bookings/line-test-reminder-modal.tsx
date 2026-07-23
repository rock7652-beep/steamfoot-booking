"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  previewBookingLineTestReminder,
  sendBookingLineTestReminder,
} from "@/server/actions/reminder";

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerName: string;
  dateLabel: string;
}

export function LineTestReminderModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
}: Props) {
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentRoute, setSentRoute] = useState<"CENTRAL" | "STORE" | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<"CENTRAL" | "STORE" | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);

  if (open && previewedFor !== bookingId) {
    setPreviewedFor(bookingId);
    setSentRoute(null);
    setPlannedRoute(null);
    setPreviewError(null);
    setSendError(null);
  } else if (!open && previewedFor !== null) {
    setPreviewedFor(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!open || previewedFor !== bookingId) return;
    let cancelled = false;
    previewBookingLineTestReminder({ bookingId }).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setPreviewError(result.error ?? "無法確認 LINE 路由");
        return;
      }
      setPlannedRoute(result.data.lineRoute);
    });
    return () => {
      cancelled = true;
    };
  }, [open, bookingId, previewedFor]);

  if (!open) return null;

  async function handleSend() {
    setPending(true);
    setSendError(null);
    try {
      const result = await sendBookingLineTestReminder({ bookingId });
      if (!result.success) {
        const message = result.error ?? "測試提醒發送失敗";
        setSendError(message);
        toast.error(message);
        return;
      }
      setSentRoute(result.data.lineRoute);
      toast.success(
        `測試提醒已由${result.data.lineRoute === "CENTRAL" ? "蒸管家中央 LINE" : "分店 LINE"}發送`,
      );
    } catch {
      const message = "發送失敗，請稍後再試";
      setSendError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-earth-900/40"
        onClick={pending ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-test-reminder-title"
        className="relative w-[420px] max-w-[92vw] rounded-lg bg-white shadow-[0_8px_32px_rgba(20,24,31,0.18)]"
      >
        <div className="border-b border-earth-200 px-5 py-3">
          <h3 id="line-test-reminder-title" className="text-base font-semibold text-earth-900">
            發送 LINE 測試提醒
          </h3>
          <p className="mt-0.5 text-xs text-earth-500">
            系統會在送出當下重新確認中央或分店 LINE 路由。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="rounded-md bg-earth-50 px-3 py-2.5">
            <p><span className="text-earth-500">顧客：</span>{customerName}</p>
            <p className="mt-1"><span className="text-earth-500">預約：</span>{dateLabel}</p>
            <p className="mt-1">
              <span className="text-earth-500">預計路由：</span>
              {previewError
                ? <span className="text-red-600">{previewError}</span>
                : plannedRoute
                  ? plannedRoute === "CENTRAL"
                    ? "蒸管家中央 LINE"
                    : "分店 LINE"
                  : "確認中…"}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-earth-600">
            訊息會明確標示為測試，並留下實際發送路由與操作者紀錄。
            這次測試不會取代、取消或重複計算今晚的正式預約提醒。
          </p>
          {sentRoute && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              發送成功：{sentRoute === "CENTRAL" ? "蒸管家中央 LINE" : "分店 LINE"}
            </div>
          )}
          {sendError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {sendError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-earth-200 bg-earth-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-earth-300 bg-white px-4 text-sm text-earth-700 disabled:opacity-60"
          >
            {sentRoute ? "完成" : "取消"}
          </button>
          {!sentRoute && (
            <button
              type="button"
              onClick={handleSend}
              disabled={pending || plannedRoute === null || previewError !== null}
              className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "發送中…" : "確認發送測試"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
