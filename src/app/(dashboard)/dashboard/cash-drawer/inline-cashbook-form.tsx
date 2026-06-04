"use client";

/**
 * InlineCashbookForm — 「記一筆收支」現金管理頁內 inline form（PR-G5.1b）
 *
 * 目的：讓店長在現金管理頁原地完成記一筆收支，不再跳 /dashboard/cashbook/new。
 *
 * 設計沿用 TodayOpenForm 的 client wrapper 模式：
 *   - server component 父層（DailyActionsArea / ClosedActionsArea）用 closure
 *     綁好 createCashbookEntry，當 `action` prop 傳進來。
 *   - 用 useActionState 接 result：成功 → client 端 window.location.assign(returnPath)
 *     走 hard navigation（等效 F5），讓 page server components 重跑、新紀錄即時出現，
 *     繞開 same-URL inline RSC payload 卡死路徑（與 TodayOpenForm 同因）。
 *   - 失敗 → 不跳頁、不 crash，原地顯示錯誤訊息。
 *
 * 權限：本入口只受 cashbook.create 控制（由 caller 判斷後才 render），與
 *   提領 / 補入（cashDrawer.entry）兩套權限分開。
 *
 * 類型限定 INCOME / EXPENSE：提領仍走既有 WithdrawalForm（cashDrawer.entry），
 *   不讓店長用 CashbookEntry.WITHDRAW 做提領。後端 createCashbookEntry 業務邏輯不變，
 *   已結帳日 + 現金的防呆（confirmClosedCashbookChange）由 CashbookFormFields 沿用。
 */

import { useActionState, useEffect } from "react";

import { FormSection } from "@/components/desktop";
import { SubmitButton } from "@/components/submit-button";
import type { ActionResult } from "@/types";

import { CashbookFormFields } from "../cashbook/cashbook-form-fields";

type CreateResult = ActionResult<{ entryId: string }>;

interface Props {
  /** server action：父層 server component 綁好 createCashbookEntry 後傳入。 */
  action: (prevState: CreateResult | null, formData: FormData) => Promise<CreateResult>;
  /** 成功後 hard navigate 的目標 URL（== caller 的 returnPath）。 */
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
  "block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

export function InlineCashbookForm({
  action,
  returnPath,
  today,
  closedDates,
  canAssignStaff,
  staffOptions,
}: Props) {
  const [state, formAction] = useActionState<CreateResult | null, FormData>(action, null);

  useEffect(() => {
    if (state?.success) {
      window.location.assign(returnPath);
    }
  }, [state, returnPath]);

  const isSuccess = state?.success === true;
  const errorMsg = state && !state.success ? state.error : null;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      <CashbookFormFields
        closedDates={closedDates}
        defaultEntryDate={today}
        defaultType="INCOME"
        defaultCategory=""
        defaultAmount=""
        defaultPaymentMethod={null}
        allowedTypes={["INCOME", "EXPENSE"]}
      />

      {/* 登錄人：非 ADMIN 後端鎖定為自己（不 render select）。 */}
      {canAssignStaff && (
        <FormSection title="登錄人（選填）">
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

      <FormSection title="備註">
        <textarea name="note" rows={3} className={inputCls} placeholder="輸入備註（選填）" />
      </FormSection>

      <SubmitButton
        label="確認新增"
        pendingLabel={isSuccess ? "已新增，更新中…" : "新增中..."}
        disabled={isSuccess}
        className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
      />
    </form>
  );
}
