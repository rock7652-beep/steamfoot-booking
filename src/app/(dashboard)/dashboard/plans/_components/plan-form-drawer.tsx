"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { createPlan, updatePlan } from "@/server/actions/plan";
import type { PlanCategory, ServicePlan } from "@prisma/client";

export type PlanRow = ServicePlan & { _count: { wallets: number } };

type Mode = "new" | "edit";

interface Props {
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

export function PlanFormDrawer({ open, mode, plan, onClose, onSaved }: Props) {
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
      onClose={onClose}
      labelledById="plan-drawer-title"
      width={520}
    >
      <PlanFormBody
        key={formKey}
        isEdit={isEdit}
        plan={plan}
        onClose={onClose}
        onSaved={onSaved}
      />
    </RightSheet>
  );
}

function PlanFormBody({
  isEdit,
  plan,
  onClose,
  onSaved,
}: {
  isEdit: boolean;
  plan: PlanRow | null;
  onClose: () => void;
  onSaved: (row: PlanRow) => void;
}) {
  // Controlled form state — keeps the right-side preview live and lets
  // us compose the optimistic PlanRow from the same source of truth.
  const [name, setName] = useState(isEdit && plan ? plan.name : "");
  const [category, setCategory] = useState<PlanCategory>(
    isEdit && plan ? plan.category : "SINGLE",
  );
  const [price, setPrice] = useState<string>(
    isEdit && plan ? String(Number(plan.price)) : "",
  );
  const [sessionCount, setSessionCount] = useState<string>(
    isEdit && plan ? String(plan.sessionCount) : "",
  );
  const [validityDays, setValidityDays] = useState<string>(
    isEdit && plan && plan.validityDays != null
      ? String(plan.validityDays)
      : "",
  );
  const [description, setDescription] = useState<string>(
    isEdit && plan ? (plan.description ?? "") : "",
  );
  const [sortOrder, setSortOrder] = useState<string>(
    isEdit && plan ? String(plan.sortOrder) : "",
  );
  const [isActive, setIsActive] = useState<boolean>(
    isEdit && plan ? plan.isActive : true,
  );
  const [publicVisible, setPublicVisible] = useState<boolean>(
    isEdit && plan ? plan.publicVisible : false,
  );
  const [pending, startAction] = useTransition();

  const priceNum = Number(price) || 0;
  const sessionCountNum = Number(sessionCount) || 0;
  const avgPerSession =
    sessionCountNum > 0 ? Math.round(priceNum / sessionCountNum) : 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name || !price || !sessionCount) {
      toast.error("請填寫名稱、價格與堂數");
      return;
    }
    const validityDaysNum = validityDays ? Number(validityDays) : null;
    const sortOrderNum = sortOrder ? Number(sortOrder) : 0;

    startAction(async () => {
      if (isEdit && plan) {
        const result = await updatePlan(plan.id, {
          name,
          price: priceNum,
          sessionCount: sessionCountNum,
          validityDays: validityDaysNum,
          description: description || null,
          sortOrder: sortOrderNum,
          isActive,
          // 下架時禁止顧客可購買 — server 也會擋，但 UI 提早處理避免 confusion
          publicVisible: isActive ? publicVisible : false,
        });
        if (!result.success) {
          toast.error(result.error ?? "儲存失敗");
          return;
        }
        toast.success("已更新方案");
        onSaved({
          ...plan,
          name,
          price: priceNum as unknown as PlanRow["price"],
          sessionCount: sessionCountNum,
          validityDays: validityDaysNum,
          description: description || null,
          sortOrder: sortOrderNum,
          isActive,
          publicVisible: isActive ? publicVisible : false,
          updatedAt: new Date(),
        });
        onClose();
      } else {
        const result = await createPlan({
          name,
          category,
          price: priceNum,
          sessionCount: sessionCountNum,
          validityDays: validityDaysNum ?? undefined,
          description: description || undefined,
          sortOrder: sortOrderNum,
          publicVisible,
        });
        if (!result.success) {
          toast.error(result.error ?? "新增失敗");
          return;
        }
        toast.success("已新增方案");
        const now = new Date();
        // Optimistic row — server-derived fields (storeId is filled by the
        // action from the session). We use a placeholder; the parent's next
        // navigation / refresh will canonicalise. _count.wallets starts at 0.
        onSaved({
          id: result.data!.planId,
          storeId: plan?.storeId ?? "",
          name,
          category,
          price: priceNum as unknown as PlanRow["price"],
          sessionCount: sessionCountNum,
          validityDays: validityDaysNum,
          description: description || null,
          sortOrder: sortOrderNum,
          isActive: true,
          publicVisible,
          createdAt: now,
          updatedAt: now,
          _count: { wallets: 0 },
        });
        onClose();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-earth-200 px-5 py-4">
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
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-earth-500 hover:bg-earth-100"
          aria-label="關閉"
        >
          ✕
        </button>
      </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className={labelCls}>
              方案名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              onChange={(e) => setCategory(e.target.value as PlanCategory)}
              disabled={isEdit}
              className={`mt-1 ${inputCls} ${isEdit ? "cursor-not-allowed bg-earth-50 text-earth-500" : ""}`}
            >
              <option value="TRIAL">體驗</option>
              <option value="SINGLE">單次</option>
              <option value="PACKAGE">課程</option>
            </select>
            {isEdit && (
              <p className="mt-1 text-[11px] text-earth-400">
                類別建立後不可變更
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                價格（元） <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
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
                onChange={(e) => setSessionCount(e.target.value)}
                min="1"
                step="1"
                required
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                有效天數 <span className="text-[11px] text-earth-400">（選填）</span>
              </label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
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
                onChange={(e) => setSortOrder(e.target.value)}
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
              onChange={(e) => setDescription(e.target.value)}
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
                onChange={(e) => setIsActive(e.target.checked)}
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
                onChange={(e) => setPublicVisible(e.target.checked)}
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
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-earth-200 bg-earth-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "儲存中..." : isEdit ? "儲存變更" : "新增"}
        </button>
      </div>
    </form>
  );
}
