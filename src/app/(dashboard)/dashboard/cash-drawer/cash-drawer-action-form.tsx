"use client";

/**
 * CashDrawerActionForm — 現金抽屜表單共用 client wrapper（A-1 修正）
 *
 * 為什麼存在：原本提領 / 補入 / 調整 / 閉店 / 補關 / 首次啟用都用
 *   `<form action={serverAction}>` + action 內 `redirect(returnPath)`。redirect 目標
 *   是同一個現金抽屜 URL，App Router 會在「同一個 server action invocation」內 inline
 *   重渲染 OPENED_TODAY 那條最重的 RSC（getCashDrawerView + computeLiveTotalsForOpenSession
 *   共 6 個 Prisma query）。在正式站（Supabase pooler + Vercel function）下，該 invocation
 *   的連線 slot 已被 action 自身的寫入用過、或撞 function timeout，inline RSC 重渲染會丟出
 *   未被 handleActionError 接住的例外 →（dashboard）error boundary 整頁錯誤頁（digest）。
 *   店長輸入金額 + 備註、按儲存後整頁跳「操作過程中發生未預期的錯誤」就是這條路。
 *
 * 修法（沿用 TodayOpenForm / InlineCashbookForm 已驗證的模式）：
 *   - server 父層用 closure 綁好 server action，簽章改為
 *     `(prevState, formData) => Promise<ActionResult>`，**只回傳 result、不再 redirect**。
 *   - 用 useActionState 接 result：成功 → client 端 `window.location.assign(returnPath)`
 *     走 hard navigation（等效 F5），page server components 重新跑、繞開 same-URL inline RSC。
 *   - 失敗 → 原地顯示紅字錯誤訊息，不跳頁、不 crash。
 *
 * 本元件只搬導航 / 錯誤呈現，完全不碰任何金額計算或業務規則（仍在各 server action 內）。
 */

import { useActionState, useEffect, type ReactNode } from "react";

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
  /** 成功後 hard navigate 的目標 URL（== 原本 redirect 的 returnPath）。 */
  returnPath: string;
  /** 送出鈕文字。 */
  submitLabel: string;
  /** 送出鈕 className（沿用各表單原本的配色）。 */
  submitClassName?: string;
  /** 成功後、跳轉前的 pending 文字。 */
  successPendingLabel?: string;
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
  successPendingLabel = "已完成，跳轉中…",
  pendingLabel = "處理中...",
  className,
  children,
}: Props) {
  const [state, formAction] = useActionState<ActionResult<unknown> | null, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      // 等效 F5：full page navigation，重新跑 page server components，
      // 不依賴 server action response 內 inline 的 RSC payload。
      window.location.assign(returnPath);
    }
  }, [state, returnPath]);

  const isSuccess = state?.success === true;
  const errorMsg = state && !state.success ? state.error : null;

  return (
    <form action={formAction} className={className}>
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}
      {/* 成功後 disable 整組欄位，避免跳轉前重複送出 */}
      <fieldset disabled={isSuccess} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
        {children}
      </fieldset>
      <SubmitButton
        label={submitLabel}
        pendingLabel={isSuccess ? successPendingLabel : pendingLabel}
        disabled={isSuccess}
        className={submitClassName}
      />
    </form>
  );
}
