"use client";

import { useEffect, useState } from "react";

// 未到處理只保留兩個選項：兩者皆「扣堂」（名額已被佔用，原堂照扣），
// 差別僅在是否額外發 7 日補課券。規則交給系統執行，不讓店長做人情判斷。
// 型別與天數單一真相來源在 booking-constants。
export type { NoShowChoice } from "@/lib/booking-constants";
import type { NoShowChoice } from "@/lib/booking-constants";
import { NO_SHOW_MAKEUP_VALID_DAYS } from "@/lib/booking-constants";

interface NoShowModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (choice: NoShowChoice) => void;
  loading?: boolean;
  // 補課預約（isMakeup）未到：server 不扣堂、不發新券，故不顯示扣堂/補課選項，
  // 僅允許標記未到，避免店長誤以為系統有扣堂或發券。
  isMakeup?: boolean;
  affectedPeople?: number;
  partial?: boolean;
}

const OPTIONS: Array<{
  value: NoShowChoice;
  label: string;
  hint: string;
}> = [
  {
    value: "DEDUCTED",
    label: "扣堂",
    hint: "名額已被佔用，依預約人數扣堂；不發補課",
  },
  {
    value: "DEDUCTED_WITH_MAKEUP",
    label: `扣堂並給 ${NO_SHOW_MAKEUP_VALID_DAYS} 日補課資格`,
    hint: `依預約人數扣堂，並依人數發 N 張 ${NO_SHOW_MAKEUP_VALID_DAYS} 日內有效的補課券`,
  },
];

export function NoShowModal({
  open,
  onClose,
  onConfirm,
  loading = false,
  isMakeup = false,
  affectedPeople,
  partial = false,
}: NoShowModalProps) {
  const [choice, setChoice] = useState<NoShowChoice>("DEDUCTED");

  // 每次開啟時重設為預設選項（render 階段調整 state，避免在 effect 內 setState
  // 觸發 cascading render；符合 react-hooks/set-state-in-effect）。
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setChoice("DEDUCTED");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  useEffect(() => {
    if (!open) return;
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
          <h3 className="text-base font-semibold text-earth-900">
            {partial ? `處理未到的 ${affectedPeople ?? 1} 人` : "標記未到"}
          </h3>
          <p className="mt-0.5 text-xs text-earth-500">
            {isMakeup
              ? "補課預約未到"
              : partial
                ? "到場者會正常完成服務"
                : "這筆預約要怎麼處理？"}
          </p>
        </div>
        {isMakeup ? (
          <div className="px-4 py-4">
            <p className="text-sm text-earth-700">
              補課預約未到：僅標記未到。
            </p>
            <p className="mt-1 text-xs text-earth-500">
              補課不扣方案堂數，也不會再產生新的補課資格。
            </p>
          </div>
        ) : (
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
                    <p className="mt-0.5 text-xs text-earth-500">
                      {partial && affectedPeople
                        ? opt.value === "DEDUCTED"
                          ? `未到的 ${affectedPeople} 人照常扣堂，不發補課`
                          : `未到的 ${affectedPeople} 人照常扣堂，並發 ${affectedPeople} 張 ${NO_SHOW_MAKEUP_VALID_DAYS} 日補課券`
                        : opt.hint}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
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
            onClick={() => onConfirm(isMakeup ? "DEDUCTED" : choice)}
            disabled={loading}
            className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isMakeup ? "標記未到" : "確認"}
          </button>
        </div>
      </div>
    </div>
  );
}
