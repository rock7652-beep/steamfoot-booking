"use client";

import { useActionState } from "react";
import {
  oauthConfirmLoginAction,
  type OAuthConfirmLoginState,
} from "@/server/actions/oauth-confirm";

/**
 * /oauth-confirm/login 客戶端表單
 *
 * 純密碼欄位 + hidden customerId/callbackUrl。submit 觸發 server action：
 * signIn customer-phone → 成功則 NextAuth 自動 redirect 到 /oauth-confirm/finalize
 * （由 server action 的 redirectTo 指定）。失敗則回傳 error 顯示。
 *
 * 不重複 phone 輸入步驟 — 上一頁 /oauth-confirm 已驗過，此處直接拿密碼。
 */

interface Props {
  customerId: string;
  callbackUrl: string;
}

const initialState: OAuthConfirmLoginState = { error: null };

export function OAuthConfirmLoginForm({ customerId, callbackUrl }: Props) {
  const [state, action, pending] = useActionState<
    OAuthConfirmLoginState,
    FormData
  >(oauthConfirmLoginAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium text-earth-700"
        >
          密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={pending}
          className="mt-1 w-full rounded-md border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-earth-50"
        />
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "登入中⋯" : "登入並完成綁定"}
      </button>
    </form>
  );
}
