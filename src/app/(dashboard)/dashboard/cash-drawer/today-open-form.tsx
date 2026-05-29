"use client";

/**
 * TodayOpenForm — 今日開店點錢 form 的 client wrapper
 *
 * 為什麼存在：原本 server component 內用 `<form action={inlineServerAction}>`
 * + action 內 `redirect(returnPath)`，redirect 目標是同一個 URL（/dashboard/
 * cash-drawer），Next.js App Router 會在 same function invocation 內把
 * OPENED_TODAY 的 RSC payload inline 包進 action response。OPENED_TODAY 是
 * cash drawer 最重的 render path（getCashDrawerView + computeLiveTotalsFor
 * OpenSession 共 6 個 Prisma query），若該 invocation 的 pooler slot 已被
 * action 自身用過、或撞到 Vercel function timeout，RSC payload 永遠送不到
 * client → `useFormStatus()` 的 pending state 永遠不 clear → 店長卡在
 * 「處理中…」直到放棄重整。F5 之所以救得回來，正是因為 fresh browser GET
 * 是新的 function invocation、新的 pool slot、新的 RSC payload。
 *
 * 修法：用 `useActionState` 接 server action 的 result，成功後 client 端
 * 直接 `window.location.assign(returnPath)` — 等效於 F5 的 hard navigation
 * 路徑，繞開 same-URL inline RSC。
 *
 * 只套用在今日開店 form。catch-up close / same-day close / entry 還是維持
 * 既有的 server-redirect 模式（user 已驗證 work），不冒險擴大 scope。
 */

import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/types";

type OpenResult = ActionResult<{ sessionId: string }>;

interface Props {
  /** server action 由父元件（server component）綁好 todayStr 後傳進來，
   *  避免在 client 重新 expose todayStr / openCashDrawerAction wiring。*/
  action: (
    prevState: OpenResult | null,
    formData: FormData,
  ) => Promise<OpenResult>;
  /** 成功後 hard navigate 的目標 URL（== 原本 redirect 的 returnPath） */
  returnPath: string;
  /** 預估開店帳面，給 input placeholder 用（純顯示） */
  placeholderAmount?: string;
}

export function TodayOpenForm({ action, returnPath, placeholderAmount }: Props) {
  const [state, formAction] = useActionState<OpenResult | null, FormData>(
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
    <form action={formAction} className="mt-6 space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-earth-700">
          實際點到金額（NT$）
        </label>
        <input
          type="number"
          name="openingActualCash"
          required
          min={0}
          step={1}
          disabled={isSuccess}
          className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 disabled:bg-earth-50"
          placeholder={placeholderAmount ? `例如 ${placeholderAmount}` : "例如 8100"}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-earth-700">
          差額原因（若與上日帳面不同必填）
        </label>
        <textarea
          name="note"
          rows={2}
          disabled={isSuccess}
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 disabled:bg-earth-50"
          placeholder="若實際金額與上日帳面不同，請說明原因"
        />
      </div>
      <SubmitButton
        label="完成今日開店點錢"
        pendingLabel={isSuccess ? "已開店，跳轉中…" : "處理中..."}
        disabled={isSuccess}
        className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
      />
    </form>
  );
}
