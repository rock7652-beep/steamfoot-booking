"use client";

/** Writes return a receipt; the mounted workspace refreshes without a document reload. */


import { useInPlaceAction } from "@/components/operations/use-in-place-action";
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
  /** 完成後同步的目標 URL（== 原本 redirect 的 returnPath） */
  returnPath: string;
  /** 預估開店帳面，給 input placeholder 用（純顯示） */
  placeholderAmount?: string;
}

export function TodayOpenForm({ action, returnPath, placeholderAmount }: Props) {
  const { state, formAction, onSubmit, pending, formVersion } = useInPlaceAction(action, returnPath, "已完成今日開店點錢");

  const errorMsg = state && !state.success ? state.error : null;

  return (
    <form key={formVersion} action={formAction} onSubmit={onSubmit} aria-busy={pending} className="mt-6 space-y-4">
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
          disabled={pending}
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
          disabled={pending}
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 disabled:bg-earth-50"
          placeholder="若實際金額與上日帳面不同，請說明原因"
        />
      </div>
      <SubmitButton
        label={pending ? "處理中…" : "完成今日開店點錢"}
        pendingLabel="處理中..."
        disabled={pending}
        className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
      />
    </form>
  );
}
