/**
 * 現金異動表單（presentational）— PR-G5.1a / A-1 client-nav 修正
 *
 * 把「提領 / 補入 / 調整」三張 inline form 抽成共用 presentational 元件，
 * 讓它們能同時被：
 *   - 日常操作區（DailyActionsArea，提領 / 補入 的大按鈕）— cash-drawer-workspace.tsx
 *   - 現金異動紀錄卡（EntrySection，盤點調整這個次要動作）— entry-section.tsx
 * 共用，避免兩份相同的表單 JSX 各自維護（"不要複製邏輯"）。
 *
 * A-1：表單外殼改用 CashDrawerActionForm（client wrapper，useActionState +
 *   成功後 window.location.assign）取代原本 server `<form action>` + redirect，
 *   避免 action 成功後 same-URL inline RSC 重渲染在正式站炸掉整頁 error boundary。
 *   本檔仍只負責 render 欄位；真正業務邏輯仍在 addCashDrawerEntryAction（單一來源）。
 *   各 caller 用 closure 綁好 sessionId / returnPath 後，把 `(prev, formData) => Promise<ActionResult>`
 *   當 `action` prop 傳入，並傳 `returnPath` 給 wrapper 做成功導航。
 */

import { CashDrawerActionForm, type CashDrawerFormAction } from "./cash-drawer-action-form";

const inputCls =
  "mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const textInputCls =
  "mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";
const noteCls =
  "mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

interface FormProps {
  /** server action：caller 綁好 sessionId 後傳入（成功只回 result，不 redirect）。 */
  action: CashDrawerFormAction;
  /** 成功後 hard navigate 的目標 URL。 */
  returnPath: string;
}

/** 提領：現金從抽屜拿出去（不算店內支出）。 */
export function WithdrawalForm({ action, returnPath }: FormProps) {
  return (
    <CashDrawerActionForm
      action={action}
      returnPath={returnPath}
      submitLabel="送出提領"
      successPendingLabel="已送出，跳轉中…"
      submitClassName="min-h-[44px] bg-orange-600 px-5 text-base text-white hover:bg-orange-700"
      className="space-y-3 p-4 md:space-y-4"
    >
      <div className="md:grid md:grid-cols-2 md:gap-4">
        <div>
          <label className={labelCls}>金額（NT$）</label>
          <input
            type="number"
            name="amount"
            required
            min={1}
            step={1}
            className={inputCls}
            placeholder="例如 5000"
          />
        </div>
        <div className="mt-3 md:mt-0">
          <label className={labelCls}>原因（必填）</label>
          <input
            type="text"
            name="reason"
            required
            minLength={1}
            maxLength={100}
            className={textInputCls}
            placeholder="例如：老闆領現存銀行"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>備註（選填）</label>
        <textarea name="note" rows={2} maxLength={500} className={noteCls} />
      </div>
    </CashDrawerActionForm>
  );
}

/** 補入：補找零金 / 備用金 / 保險箱補現金。 */
export function DepositForm({ action, returnPath }: FormProps) {
  return (
    <CashDrawerActionForm
      action={action}
      returnPath={returnPath}
      submitLabel="送出補入"
      successPendingLabel="已送出，跳轉中…"
      submitClassName="min-h-[44px] bg-green-600 px-5 text-base text-white hover:bg-green-700"
      className="space-y-3 p-4 md:space-y-4"
    >
      <div className="md:grid md:grid-cols-2 md:gap-4">
        <div>
          <label className={labelCls}>金額（NT$）</label>
          <input
            type="number"
            name="amount"
            required
            min={1}
            step={1}
            className={inputCls}
            placeholder="例如 2000"
          />
        </div>
        <div className="mt-3 md:mt-0">
          <label className={labelCls}>原因（必填）</label>
          <input
            type="text"
            name="reason"
            required
            minLength={1}
            maxLength={100}
            className={textInputCls}
            placeholder="例如：保險箱補找零金"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>備註（選填）</label>
        <textarea name="note" rows={2} maxLength={500} className={noteCls} />
      </div>
    </CashDrawerActionForm>
  );
}

/** 調整：盤點短少 / 溢出（次要動作，放在現金異動紀錄卡內）。 */
export function AdjustmentForm({ action, returnPath }: FormProps) {
  return (
    <CashDrawerActionForm
      action={action}
      returnPath={returnPath}
      submitLabel="送出調整"
      successPendingLabel="已送出，跳轉中…"
      submitClassName="min-h-[44px] bg-earth-700 px-5 text-base text-white hover:bg-earth-800"
      className="space-y-3 p-4 md:space-y-4"
    >
      <div>
        <p className={labelCls}>方向（必選）</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-earth-800 md:gap-6">
          <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-earth-200 bg-white px-3">
            <input type="radio" name="direction" value="IN" required />
            盤點溢出（+）
          </label>
          <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-earth-200 bg-white px-3">
            <input type="radio" name="direction" value="OUT" required />
            盤點短少（−）
          </label>
        </div>
      </div>
      <div className="md:grid md:grid-cols-2 md:gap-4">
        <div>
          <label className={labelCls}>金額（NT$）</label>
          <input
            type="number"
            name="amount"
            required
            min={1}
            step={1}
            className={inputCls}
            placeholder="例如 100"
          />
        </div>
        <div className="mt-3 md:mt-0">
          <label className={labelCls}>原因（必填）</label>
          <input
            type="text"
            name="reason"
            required
            minLength={1}
            maxLength={100}
            className={textInputCls}
            placeholder="例如：閉店盤點短少 100"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>備註（選填）</label>
        <textarea name="note" rows={2} maxLength={500} className={noteCls} />
      </div>
    </CashDrawerActionForm>
  );
}
