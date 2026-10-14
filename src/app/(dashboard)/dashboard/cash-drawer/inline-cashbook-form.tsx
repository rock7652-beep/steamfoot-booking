"use client";

/** Writes return a receipt; the mounted workspace refreshes without a document reload. */



import { FormSection } from "@/components/desktop";
import { useInPlaceAction } from "@/components/operations/use-in-place-action";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/types";

import { CashbookEntryFields } from "../cashbook/_components/cashbook-entry-fields";

type CreateResult = ActionResult<{ entryId: string }>;

interface Props {
  /** server action：父層 server component 綁好 createCashbookEntry 後傳入。 */
  action: (prevState: CreateResult | null, formData: FormData) => Promise<CreateResult>;
  /** Current store for the customer search index. */
  storeId: string;
  instantSearch: boolean;
  /** 完成後同步的目標 URL（== caller 的 returnPath）。 */
  returnPath: string;
  /** 今天（"YYYY-MM-DD"，UTC+8），日期欄位預設值。 */
  today: string;
  /** 此店近 ~180 天的已閉店營業日，給前端即時防呆提示。 */
  closedDates: string[];
  /** ADMIN 才能指派登錄人；非 ADMIN 後端強制鎖定為自己。 */
  canAssignStaff: boolean;
  /** ADMIN 指派用的店長清單。 */
  staffOptions: { id: string; displayName: string }[];
}

const inputCls =
  "block min-h-11 min-w-0 w-full max-w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

export function InlineCashbookForm({
  action,
  storeId,
  instantSearch,
  returnPath,
  today,
  closedDates,
  canAssignStaff,
  staffOptions,
}: Props) {
  const { state, formAction, onSubmit, pending, formVersion } = useInPlaceAction(action, returnPath, "已新增收支");

  const errorMsg = state && !state.success ? state.error : null;

  return (
    <form key={formVersion} action={formAction} onSubmit={onSubmit} aria-busy={pending} className="space-y-4 p-4 sm:p-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      <fieldset disabled={pending} className="contents">
      <CashbookEntryFields storeId={storeId} today={today} editableDate instantSearch={instantSearch} closedDates={closedDates} />

      {/* 登錄人：非 ADMIN 後端鎖定為自己（不 render select）。 */}
      {canAssignStaff && (
        <FormSection title="登錄人（選填）" compact>
          <select name="staffId" className={inputCls}>
            <option value="">不指定</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <p className="text-xs text-earth-500">
            指定本筆紀錄的可見與編輯範圍。本筆金額不會算入該店長的個人支出。
          </p>
        </FormSection>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-earth-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
        <SubmitButton
          label={pending ? "新增中…" : "確認新增"}
          pendingLabel="新增中..."
          disabled={pending}
          className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700 sm:ml-auto sm:flex sm:w-auto sm:min-w-40"
        />
      </div>
      </fieldset>
    </form>
  );
}

