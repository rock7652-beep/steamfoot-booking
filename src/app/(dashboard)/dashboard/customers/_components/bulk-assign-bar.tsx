"use client";

import { useState } from "react";

/**
 * BulkAssignBar — 顧客列表底部 sticky 批次操作列
 *
 * 出現條件：selectedCount > 0
 * 動作：選擇一位直屬店長 → 「批次指派」→ window.confirm → 呼叫 onSubmit
 * 不負責 toast，由 parent 處理 onSubmit 的回傳結果
 */

interface StaffOption {
  id: string;
  displayName: string;
}

interface Props {
  /** 已選顧客數 */
  selectedCount: number;
  /** 同店 ACTIVE staff 選項 */
  staffOptions: StaffOption[];
  /** 提交（parent 應呼叫 bulkUpdateCustomerAssignment 並處理 toast）。回傳代表完成 */
  onSubmit: (assignedStaffId: string) => Promise<void>;
  /** 清空選取 */
  onCancel: () => void;
}

export function BulkAssignBar({ selectedCount, staffOptions, onSubmit, onCancel }: Props) {
  const [staffId, setStaffId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedStaff = staffOptions.find((s) => s.id === staffId);
  const canSubmit = !!staffId && !submitting && selectedCount > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedStaff) return;
    const ok = window.confirm(
      `確定要將已選的 ${selectedCount} 位顧客指派給 ${selectedStaff.displayName} 嗎？`,
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      await onSubmit(staffId);
      // 成功後 parent 會清空 selection；這裡把 dropdown 也重置回未選
      setStaffId("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="批次指派直屬店長"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-earth-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm font-medium text-earth-900">
          已選 <span className="tabular-nums text-primary-700">{selectedCount}</span> 位顧客
        </span>

        <div className="flex items-center gap-2">
          <label htmlFor="bulk-assign-staff" className="text-xs text-earth-600">
            指派給：
          </label>
          <select
            id="bulk-assign-staff"
            className="rounded border border-earth-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            disabled={submitting}
          >
            <option value="">請選擇店長</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-earth-300 px-3 py-1 text-sm text-earth-700 hover:bg-earth-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded bg-primary-600 px-3 py-1 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-earth-300"
          >
            {submitting ? "指派中..." : "批次指派"}
          </button>
        </div>
      </div>
    </div>
  );
}
