"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";

// ============================================================
// SubmitButton — form action 內的送出按鈕
// ============================================================

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
      className={`relative inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && <Spinner />}
      {pending ? pendingLabel : label}
    </button>
  );
}

// ============================================================
// ActionButton — 非表單場景的動作按鈕
// ============================================================

const VARIANT_STYLES = {
  primary: "bg-primary-600 text-white hover:bg-primary-700",
  secondary: "border border-earth-300 bg-white text-earth-700 hover:bg-earth-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
} as const;

const SIZE_STYLES = {
  sm: "min-h-[44px] px-4 text-sm",
  md: "min-h-[48px] px-5 text-base",
} as const;

interface ActionButtonProps {
  /** 按鈕文案 */
  label: string;
  /** 執行中文案（預設：處理中...） */
  pendingLabel?: string;
  /** 點擊回呼 — 回傳 Promise，自動管理 loading 狀態 */
  onClick: () => Promise<void>;
  /** 按鈕風格 */
  variant?: keyof typeof VARIANT_STYLES;
  /** 按鈕大小 */
  size?: keyof typeof SIZE_STYLES;
  /** 外部 disabled 控制 */
  disabled?: boolean;
  /** 額外 className */
  className?: string;
}

/**
 * 動作按鈕 — 4 種狀態：idle → loading → success → idle
 *
 * 用於非表單場景（onClick handler），自動管理：
 * - Loading spinner + pendingLabel
 * - 成功後短暫顯示綠勾（500ms）
 * - 失敗自動回到 idle（error 由 caller 處理 toast）
 */
export function ActionButton({
  label,
  pendingLabel = "處理中...",
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
}: ActionButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "success">("idle");
  const isDisabled = state !== "idle" || disabled;

  async function handleClick() {
    setState("loading");
    try {
      await onClick();
      setState("success");
      setTimeout(() => setState("idle"), 500);
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
    >
      {state === "loading" && <Spinner />}
      {state === "success" && <CheckIcon />}
      {state === "loading" ? pendingLabel : state === "success" ? "完成" : label}
    </button>
  );
}

// ============================================================
// Shared icons
// ============================================================

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
