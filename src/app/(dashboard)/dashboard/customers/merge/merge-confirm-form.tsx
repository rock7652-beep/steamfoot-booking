"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeCustomerAction } from "@/server/actions/customer-merge";

/**
 * 合併確認表單（client）
 *
 * 兩階段：
 *   1. 顯示「我已確認…」checkbox + 提交按鈕
 *   2. 點按鈕後 server action 執行；成功後 router.replace 帶 result 參數
 *
 * Phase 1 不做樂觀更新，等 action 回傳再顯示結果。
 */
export function MergeConfirmForm({
  sourceCustomerId,
  targetCustomerId,
}: {
  sourceCustomerId: string;
  targetCustomerId: string;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    if (!acknowledged) return;
    setError(null);
    startTransition(async () => {
      const result = await mergeCustomerAction({ sourceCustomerId, targetCustomerId });
      if (!result.success) {
        setError(result.error || "合併失敗");
        return;
      }
      const counts = result.data.movedCounts;
      const summary = [
        `已將 source ${sourceCustomerId} 合併進 target ${targetCustomerId}。`,
        `搬移：bookings=${counts.bookings} / wallets=${counts.customerPlanWallets} / transactions=${counts.transactions} / points=${counts.pointRecords} / makeup=${counts.makeupCredits}`,
        `推薦：referrer=${counts.referralsAsReferrer} converted=${counts.referralsAsConverted} sponsored=${counts.sponsoredCustomers}`,
        `合併欄位：${result.data.mergedIdentityFields.join(", ") || "（無）"}`,
      ].join("\n");
      const url = `/dashboard/customers/merge?result=${encodeURIComponent(summary)}`;
      router.replace(url);
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-earth-200 bg-white p-4">
      <label className="flex items-start gap-2 text-sm text-earth-700">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1"
          disabled={pending}
        />
        <span>
          我已確認兩筆顧客為同一人，且了解合併後 source 會被歸檔、無法復原。
        </span>
      </label>

      {error ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!acknowledged || pending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "合併中..." : "確認合併"}
        </button>
      </div>
    </div>
  );
}
