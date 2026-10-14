"use client";

/** Writes return a receipt; the mounted workspace refreshes without a document reload. */

import type { ReactNode } from "react";

import { useInPlaceAction } from "@/components/operations/use-in-place-action";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/types";

/** 現金抽屜表單共用的 server action 簽章（useActionState 用）。 */
export type CashDrawerFormAction = (
  prevState: ActionResult<unknown> | null,
  formData: FormData,
) => Promise<ActionResult<unknown>>;

interface Props {
  /** server action：父層 server component 綁好 sessionId / returnPath 等後傳入。 */
  action: CashDrawerFormAction;
  /** 完成後同步的目標 URL（== 原本 redirect 的 returnPath）。 */
  returnPath: string;
  /** 送出鈕文字。 */
  submitLabel: string;
  /** 送出鈕 className（沿用各表單原本的配色）。 */
  submitClassName?: string;
  /** 舊版成功提示文字（保留呼叫端相容性）。 */
  /** 送出中的 pending 文字。 */
  pendingLabel?: string;
  /** form className（沿用各表單原本的間距 / padding，避免動版面）。 */
  className?: string;
  /** 表單欄位（host JSX，由 server 父層提供）。 */
  children: ReactNode;
}

export function CashDrawerActionForm({
  action,
  returnPath,
  submitLabel,
  submitClassName,
  pendingLabel = "處理中...",
  className,
  children,
}: Props) {
  const { state, formAction, onSubmit, pending, formVersion } = useInPlaceAction(action, returnPath, "操作已完成");

  const errorMsg = state && !state.success ? state.error : null;

  return (
    <form key={formVersion} action={formAction} onSubmit={onSubmit} aria-busy={pending} className={className}>
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}
      {/* 送出及同步期間停用欄位，避免重複送出 */}
      <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
        {children}
      </fieldset>
      <SubmitButton
        label={pending ? pendingLabel : submitLabel}
        pendingLabel={pendingLabel}
        disabled={pending}
        className={submitClassName}
      />
    </form>
  );
}
