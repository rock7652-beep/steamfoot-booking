"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { createBonusRule, updateBonusRule } from "@/server/actions/bonus-rule";

export interface BonusRuleRow {
  id: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

type Mode = "new" | "edit";

interface Props {
  open: boolean;
  mode: Mode;
  rule: BonusRuleRow | null;
  onClose: () => void;
  /** Called with the saved row so parent can patch its rules list. */
  onSaved: (row: BonusRuleRow) => void;
}

const inputCls =
  "block w-full rounded-md border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export function BonusRuleDrawer({ open, mode, rule, onClose, onSaved }: Props) {
  // Same key-remount trick as plan-form-drawer — avoids the
  // `react-hooks/set-state-in-effect` lint cascade and means switching
  // between "new" / a different "edit" target resets cleanly.
  const formKey = open
    ? mode === "edit" && rule
      ? `edit:${rule.id}`
      : "new"
    : "closed";
  const isEdit = mode === "edit" && !!rule;

  return (
    <RightSheet
      open={open}
      onClose={onClose}
      labelledById="bonus-rule-drawer-title"
      width={480}
    >
      <FormBody
        key={formKey}
        isEdit={isEdit}
        rule={rule}
        onClose={onClose}
        onSaved={onSaved}
      />
    </RightSheet>
  );
}

function FormBody({
  isEdit,
  rule,
  onClose,
  onSaved,
}: {
  isEdit: boolean;
  rule: BonusRuleRow | null;
  onClose: () => void;
  onSaved: (row: BonusRuleRow) => void;
}) {
  const [name, setName] = useState(isEdit && rule ? rule.name : "");
  const [points, setPoints] = useState<string>(
    isEdit && rule ? String(rule.points) : "",
  );
  const [description, setDescription] = useState(
    isEdit && rule ? (rule.description ?? "") : "",
  );
  const [startDate, setStartDate] = useState(
    isEdit && rule ? (rule.startDate ?? "") : "",
  );
  const [endDate, setEndDate] = useState(
    isEdit && rule ? (rule.endDate ?? "") : "",
  );
  const [isActive, setIsActive] = useState<boolean>(
    isEdit && rule ? rule.isActive : true,
  );
  const [pending, startAction] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !points) {
      toast.error("請填寫名稱與點數");
      return;
    }
    const pointsNum = Number(points);
    if (!pointsNum || pointsNum <= 0) {
      toast.error("點數必須大於 0");
      return;
    }

    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("points", String(pointsNum));
    if (description.trim()) fd.set("description", description.trim());
    if (startDate) fd.set("startDate", startDate);
    if (endDate) fd.set("endDate", endDate);

    startAction(async () => {
      if (isEdit && rule) {
        fd.set("id", rule.id);
        fd.set("isActive", String(isActive));
        const result = await updateBonusRule(fd);
        if (!result.success) {
          toast.error(result.error || "儲存失敗");
          return;
        }
        toast.success("已更新獎勵項目");
        onSaved({
          ...rule,
          name: name.trim(),
          points: pointsNum,
          description: description.trim() || null,
          isActive,
          startDate: startDate || null,
          endDate: endDate || null,
        });
        onClose();
      } else {
        const result = await createBonusRule(fd);
        if (!result.success) {
          toast.error(result.error || "新增失敗");
          return;
        }
        toast.success("已新增獎勵項目");
        onSaved({
          id: result.id,
          name: name.trim(),
          points: pointsNum,
          description: description.trim() || null,
          isActive: true,
          startDate: startDate || null,
          endDate: endDate || null,
          sortOrder: 0,
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
            id="bonus-rule-drawer-title"
            className="text-lg font-bold text-earth-900"
          >
            {isEdit ? "編輯獎勵項目" : "新增獎勵項目"}
          </h2>
          <p className="mt-0.5 text-[11px] text-earth-500">
            {isEdit
              ? "變更後會立即套用到後台手動加點選單"
              : "建立後預設啟用，可隨時切換停用狀態"}
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
            名稱 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className={`mt-1 ${inputCls}`}
            placeholder="例：參加說明會"
          />
        </div>

        <div>
          <label className={labelCls}>
            點數 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            min="1"
            step="1"
            required
            className={`mt-1 ${inputCls}`}
            placeholder="3"
          />
          <p className="mt-1 text-[11px] text-earth-400">
            建議：1–3 點用於日常互動，5–10 點用於分享 / 推薦
          </p>
        </div>

        <div>
          <label className={labelCls}>
            說明 <span className="text-[11px] text-earth-400">（選填）</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className={`mt-1 ${inputCls}`}
            placeholder="例：完成一次蒸足體驗即可獲得點數"
          />
          <p className="mt-1 text-[11px] text-earth-400">
            前台「我的點數」與後台手動加點選單會顯示這行
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              開始日 <span className="text-[11px] text-earth-400">（選填）</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className={labelCls}>
              結束日 <span className="text-[11px] text-earth-400">（選填）</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>

        {isEdit && (
          <label className="flex items-start gap-2 rounded-md border border-earth-200 bg-earth-50/40 p-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <div className="text-sm font-medium text-earth-800">
                啟用（後台手動加點選單會顯示）
              </div>
              <div className="mt-0.5 text-[11px] text-earth-500">
                關閉後既有歷史紀錄不受影響，但無法再選此項加點
              </div>
            </div>
          </label>
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
