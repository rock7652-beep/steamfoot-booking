"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  previewBookingTestReminder,
  sendBookingTestReminder,
} from "@/server/actions/reminder";

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  customerName: string;
  dateLabel: string;
}

export function TestReminderModal({
  open,
  onClose,
  bookingId,
  customerName,
  dateLabel,
}: Props) {
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentChannel, setSentChannel] = useState<string | null>(null);
  const [plannedChannel, setPlannedChannel] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);
  const [confirmationStep, setConfirmationStep] = useState<1 | 2>(1);

  if (open && previewedFor !== bookingId) {
    setPreviewedFor(bookingId);
    setSentChannel(null);
    setPlannedChannel(null);
    setPreviewError(null);
    setSendError(null);
    setConfirmationStep(1);
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
    previewBookingTestReminder({ bookingId }).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setPreviewError(result.error ?? "無法確認發送管道");
        return;
      }
      setPlannedChannel(result.data.channelLabel);
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
      const result = await sendBookingTestReminder({ bookingId });
      if (!result.success) {
        const message = result.error ?? "測試提醒發送失敗";
        setSendError(message);
        toast.error(message);
        return;
      }
      setSentChannel(result.data.channelLabel);
      toast.success(`測試提醒已由 ${result.data.channelLabel} 發送`);
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
        aria-labelledby="test-reminder-title"
        className="relative w-[420px] max-w-[92vw] rounded-lg bg-white shadow-[0_8px_32px_rgba(20,24,31,0.18)]"
      >
        <div className="border-b border-earth-200 px-5 py-3">
          <h3 id="test-reminder-title" className="text-base font-semibold text-earth-900">
            傳送測試提醒
          </h3>
          <p className="mt-0.5 text-xs text-earth-500">
            系統只會依這筆預約的原始聊天來源選擇一個管道。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="rounded-md bg-earth-50 px-3 py-2.5">
            <p><span className="text-earth-500">顧客：</span>{customerName}</p>
            <p className="mt-1"><span className="text-earth-500">預約：</span>{dateLabel}</p>
            <p className="mt-1">
              <span className="text-earth-500">實際管道：</span>
              {previewError
                ? <span className="text-red-600">{previewError}</span>
                : plannedChannel
                  ? plannedChannel
                  : "確認中…"}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-earth-600">
            訊息會明確標示為測試，並留下實際發送管道與操作者紀錄。
            這次測試不會取代、取消或重複計算今晚的正式預約提醒。
          </p>
          {confirmationStep === 2 && !sentChannel && !sendError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              請再次確認：將以 {plannedChannel} 向 {customerName} 傳送測試提醒。
            </div>
          )}
          {sentChannel && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              發送成功：{sentChannel}
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
            {sentChannel ? "完成" : "取消"}
          </button>
          {!sentChannel && confirmationStep === 1 && (
            <button
              type="button"
              onClick={() => setConfirmationStep(2)}
              disabled={pending || plannedChannel === null || previewError !== null}
              className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
            >
              下一步：再次確認
            </button>
          )}
          {!sentChannel && confirmationStep === 2 && (
            <button
              type="button"
              onClick={handleSend}
              disabled={pending || plannedChannel === null || previewError !== null}
              className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "發送中…" : `確認以 ${plannedChannel} 傳送`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
