"use client";
import styles from "@/components/admin/profile-plan-layout.module.css";

import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedSteamPlan } from "@/lib/steam-plan-save";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import type { PlanCategory, ServicePlan } from "@prisma/client";

export type PlanRow = ServicePlan & { _count: { wallets: number } };

type Mode = "new" | "edit";

interface Props {
  storeId:string;
  open: boolean;
  mode: Mode;
  plan: PlanRow | null;
  onClose: () => void;
  /** Fired with the resulting row so parent can patch its plans list. */
  onSaved: (row: PlanRow) => void;
}

const inputCls =
  "block w-full rounded-md border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export function PlanFormDrawer({ storeId,open, mode, plan, onClose, onSaved }: Props) {
  const [saving,setSaving]=useState(false);
  const close=()=>{if(!saving)onClose();};
  // Re-mount the inner form whenever the drawer opens for a different
  // (mode, plan) combo — `key` resets useState initialisers without the
  // `setState-in-effect` lint footgun, and avoids leaking values from a
  // previously edited plan into a fresh "新增" view.
  const formKey = open
    ? mode === "edit" && plan
      ? `edit:${plan.id}`
      : "new"
    : "closed";
  const isEdit = mode === "edit" && !!plan;

  return (
    <RightSheet
      open={open}
      onClose={close}
      labelledById="plan-drawer-title"
      width={520}
    >
      <PlanFormBody
        key={formKey}
        storeId={storeId}
        isEdit={isEdit}
        plan={plan}
        onClose={onClose}
        onSaved={onSaved}
        onPending={setSaving}
      />
    </RightSheet>
  );
}

function PlanFormBody({
  storeId,isEdit,
  plan,
  onClose,
  onSaved, onPending,
}: {
  storeId:string;
  isEdit: boolean;
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: (row: PlanRow) => void;
  onPending: (pending:boolean)=>void;
}) {
  // The preview follows the draft; confirmed rows come from the committed receipt.
  const router = useRouter();
  const draft = useFormDraft(`steamfoot-plan:${isEdit && plan ? plan.id : "new"}`, {
    name: isEdit && plan ? plan.name : "", category: isEdit && plan ? plan.category : "SINGLE",
    price: isEdit && plan ? String(Number(plan.price)) : "",
    sessionCount: isEdit && plan ? String(plan.sessionCount) : "",
    validityDays: isEdit && plan && plan.validityDays != null ? String(plan.validityDays) : "",
    description: isEdit && plan ? plan.description ?? "" : "",
    sortOrder: isEdit && plan ? String(plan.sortOrder) : "",
    isActive: isEdit && plan ? plan.isActive : true,
    publicVisible: isEdit && plan ? plan.publicVisible : false,
  }, isEdit && plan ? new Date(plan.updatedAt).toISOString() : null);
  const {busy:saveLockRef,mounted}=draft;
  const { name, category, price, sessionCount, validityDays, description, sortOrder, isActive, publicVisible } = draft.values;
  const pathname=usePathname();
  const mutation=useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/steam-plan`,storeId,savedSteamPlan);
  const pending=mutation.pending;
  const [error,setError]=useState("");
  useEffect(()=>{onPending(pending||mutation.uncertain);},[onPending,pending,mutation.uncertain]);

  const priceNum = Number(price) || 0;
  const sessionCountNum = Number(sessionCount) || 0;
  const avgPerSession =
    sessionCountNum > 0 ? Math.round(priceNum / sessionCountNum) : 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saveLockRef.current || draft.stale) return;
    if (!isEdit && category === "TRIAL") {
      toast.error("體驗請使用「建立體驗預約」；此處請選擇單次或課程");
      return;
    }
    if (!name || !price || !sessionCount) {
      toast.error("請填寫名稱、價格與堂數");
      return;
    }
    const validityDaysNum = validityDays ? Number(validityDays) : null;
    const sortOrderNum = sortOrder ? Number(sortOrder) : 0;

    saveLockRef.current = true;setError("");
    const values={name,price:priceNum,sessionCount:sessionCountNum,description:description||null,validityDays:validityDaysNum,sortOrder:sortOrderNum,publicVisible:isActive?publicVisible:false};
    const input=isEdit&&plan?{operation:"UPDATE",id:plan.id,values:{...values,isActive,expectedUpdatedAt:draft.expectedRevision}}:{operation:"CREATE",values:{...values,category,validityDays:validityDaysNum??undefined,description:description||undefined}};
    void mutation.save(input).then(result=>{
      if(!mounted.current)return;
      if(!result.success){if(!result.uncertain&&isEdit)router.refresh();setError(result.error);toast.error(result.error);return;}
      const row=result.data;
      draft.clear();
      onSaved({...row,price:row.price as unknown as PlanRow["price"],createdAt:new Date(row.createdAt),updatedAt:new Date(row.updatedAt)});
      toast.success(result.syncWarning?"已儲存；其他頁面更新失敗，請重新整理核對。":isEdit?"已更新方案":"已新增方案");
      onClose();
    }).finally(()=>{saveLockRef.current=false;});
  }

  return (
    <form onSubmit={handleSubmit} className={`${styles.form} flex h-full min-h-0 flex-col`}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-earth-200 px-5 py-4">
        <div>
          <h2
            id="plan-drawer-title"
            className="text-lg font-bold text-earth-900"
          >
            {isEdit ? "編輯方案" : "新增方案"}
          </h2>
          <p className="mt-0.5 text-[11px] text-earth-500">
            {isEdit
              ? "類別建立後不可變更，避免影響既有錢包"
              : "建立後預設上架；可立即勾選顧客可購買"}
          </p>
        </div>
        <button
          type="button"
          onClick={()=>{if(!saveLockRef.current&&!mutation.uncertain)onClose();}}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

        {error&&<p role="alert" className="px-5 text-sm text-red-700">{error}</p>}
        <fieldset disabled={pending||mutation.uncertain} className={`${styles.fieldsContainer} min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4`}>
          <FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={() => draft.discard()} />
          <div>
            <label className={labelCls}>
              方案名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => draft.set("name", e.target.value)}
              required
              maxLength={100}
              className={`mt-1 ${inputCls}`}
              placeholder="例：入門課程方案"
            />
          </div>

          <div>
            <label className={labelCls}>類別</label>
            <select
              value={category}
              onChange={(e) => draft.set("category", e.target.value as PlanCategory)}
              disabled={isEdit}
              className={`mt-1 ${inputCls} ${isEdit ? "cursor-not-allowed bg-earth-50 text-earth-500" : ""}`}
            >
              {isEdit && category === "TRIAL" && <option value="TRIAL">體驗</option>}
              {!isEdit && category === "TRIAL" && <option value="TRIAL" disabled>請重新選擇類別</option>}
              <option value="SINGLE">單次</option>
              <option value="PACKAGE">課程</option>
            </select>
            {isEdit && (
              <p className="mt-1 text-[11px] text-earth-400">
                類別建立後不可變更
              </p>
            )}
          </div>

          <div className={styles.compactGrid}>
            <div>
              <label className={labelCls}>
                價格（元） <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => draft.set("price", e.target.value)}
                min="0"
                step="1"
                required
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>
                堂數 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={sessionCount}
                onChange={(e) => draft.set("sessionCount", e.target.value)}
                min="1"
                step="1"
                required
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>

          <div className={styles.compactGrid}>
            <div>
              <label className={labelCls}>
                有效天數 <span className="text-[11px] text-earth-400">（選填）</span>
              </label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => draft.set("validityDays", e.target.value)}
                min="1"
                step="1"
                className={`mt-1 ${inputCls}`}
                placeholder="留空 = 無期限"
              />
            </div>
            <div>
              <label className={labelCls}>
                排序 <span className="text-[11px] text-earth-400">（數字越小越前）</span>
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => draft.set("sortOrder", e.target.value)}
                min="0"
                step="1"
                className={`mt-1 ${inputCls}`}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>
              說明 <span className="text-[11px] text-earth-400">（選填）</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => draft.set("description", e.target.value)}
              rows={3}
              maxLength={500}
              className={`mt-1 ${inputCls}`}
              placeholder="簡介此方案的內容、適合對象等"
            />
          </div>

          {/* 上架狀態 */}
          <div className="space-y-3 rounded-md border border-earth-200 bg-earth-50/50 p-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => draft.set("isActive", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <div className="text-sm font-medium text-earth-800">
                  上架（後台可指派、顧客可預約）
                </div>
                <div className="mt-0.5 text-[11px] text-earth-500">
                  下架後既有顧客錢包不受影響，但無法新增使用
                </div>
              </div>
            </label>
            <label
              className={`flex items-start gap-2 ${!isActive ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={publicVisible}
                onChange={(e) => draft.set("publicVisible", e.target.checked)}
                disabled={!isActive}
                className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
              />
              <div>
                <div className="text-sm font-medium text-earth-800">
                  顧客可購買（前台 /book/shop 顯示）
                </div>
                <div className="mt-0.5 text-[11px] text-earth-500">
                  關閉則僅後台可指派；下架的方案此選項無效
                </div>
              </div>
            </label>
          </div>

          {/* 摘要 */}
          {priceNum > 0 && sessionCountNum > 0 && (
            <div className="rounded-md bg-primary-50 px-3 py-2 text-[12px] text-primary-800">
              單堂均價 <strong className="font-bold">${avgPerSession.toLocaleString()}</strong>
              {validityDays && (
                <>
                  <span className="mx-1.5 text-primary-300">｜</span>
                  有效 {validityDays} 天
                </>
              )}
            </div>
          )}

          {isEdit && plan && plan._count.wallets > 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              此方案目前有 <strong>{plan._count.wallets}</strong> 位顧客的錢包在使用，
              變更名稱與描述會立即顯示在他們的畫面；下架不會影響既有錢包。
            </div>
          )}
        </fieldset>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-earth-200 bg-earth-50 px-5 py-3">
          <button
            type="button"
            onClick={()=>{if(!saveLockRef.current&&!mutation.uncertain)onClose();}}
            disabled={pending||mutation.uncertain}
            className="inline-flex min-h-11 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "儲存中..." : mutation.uncertain ? "重試確認儲存結果" : isEdit ? "儲存變更" : "新增"}
        </button>
      </div>
    </form>
  );
}
