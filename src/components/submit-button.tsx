"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  /** 預設文案 */
  label?: string;
  /** 送出中文案 */
  pendingLabel?: string;
  /** 額外 className */
  className?: string;
  /** 是否為 disabled（外部控制） */
  disabled?: boolean;
}

/**
 * 通用送出按鈕 — 自動偵測 form pending 狀態
 *
 * 可直接放入任何 <form action={...}> 裡，
 * 不需要把整個表單轉成 client component。
 */
export function SubmitButton({
  label = "儲存",
  pendingLabel = "處理中...",
  className = "",
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}
