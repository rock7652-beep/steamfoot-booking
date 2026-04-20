"use client";

import { useEffect, useState } from "react";

export type NoShowChoice =
  | "DEDUCTED"
  | "NOT_DEDUCTED_WITH_MAKEUP"
  | "NOT_DEDUCTED_NO_MAKEUP";

interface NoShowModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (choice: NoShowChoice) => void;
  loading?: boolean;
}

const OPTIONS: Array<{
  value: NoShowChoice;
  label: string;
  hint: string;
}> = [
  {
    value: "DEDUCTED",
    label: "扣除一堂",
    hint: "依店規扣除顧客此次預約的一堂",
  },
  {
    value: "NOT_DEDUCTED_WITH_MAKEUP",
    label: "發補課",
    hint: "不扣堂，發 30 天內可用的補課資格",
  },
  {
    value: "NOT_DEDUCTED_NO_MAKEUP",
    label: "不處理",
    hint: "僅標記未到，不扣堂也不發補課",
  },
];

export function NoShowModal({
  open,
  onClose,
  onConfirm,
  loading = false,
}: NoShowModalProps) {
  const [choice, setChoice] = useState<NoShowChoice>("DEDUCTED");

  useEffect(() => {
    if (!open) return;
    setChoice("DEDUCTED");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, loading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        onClick={loading ? undefined : onClose}
        className="absolute inset-0 bg-earth-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-[400px] max-w-[92vw] rounded-lg bg-white shadow-[0_8px_32px_rgba(20,24,31,0.18)]"
      >
        <div className="border-b border-earth-200 px-5 py-3">
          <h3 className="text-base font-semibold text-earth-900">標記未到</h3>
          <p className="mt-0.5 text-xs text-earth-500">
            這筆預約要怎麼處理？
          </p>
        </div>
        <div className="space-y-1.5 px-4 py-3">
          {OPTIONS.map((opt) => {
            const selected = choice === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  selected
                    ? "border-primary-500 bg-primary-50"
                    : "border-earth-200 bg-white hover:bg-earth-50"
                }`}
              >
                <input
                  type="radio"
                  name="no-show-choice"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setChoice(opt.value)}
                  disabled={loading}
                  className="mt-0.5 h-4 w-4 accent-primary-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-earth-900">
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs text-earth-500">{opt.hint}</p>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-earth-200 bg-earth-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choice)}
            disabled={loading}
            className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}
