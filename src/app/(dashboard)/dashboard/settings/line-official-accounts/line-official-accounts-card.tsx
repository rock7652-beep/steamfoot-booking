"use client";

import { useState } from "react";
import {
  checkAllLineOfficialAccounts,
  type LineOfficialAccountStatus,
} from "@/server/actions/line-official-accounts";

type Props = {
  initialStatuses: LineOfficialAccountStatus[];
};

export function LineOfficialAccountsCard({ initialStatuses }: Props) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    setPending(true);
    setError(null);
    const result = await checkAllLineOfficialAccounts();
    if (result.success) setStatuses(result.data);
    else setError(result.error ?? "無法完成 LINE 官方帳號驗證");
    setPending(false);
  }

  return (
    <section className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-earth-900">LINE 官方帳號</h2>
          <p className="mt-1 text-xs text-earth-500">只顯示各分店是否正常，不顯示 Token 或其他技術資料。</p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={pending}
          className="h-9 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "驗證中…" : "重新驗證"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 divide-y divide-earth-100 rounded-lg border border-earth-100">
        {statuses.map((item) => {
          const normal = item.status === "NORMAL";
          return (
            <div key={item.storeSlug} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-earth-800">{item.storeName}</span>
              <span className={`text-sm font-semibold ${normal ? "text-green-700" : item.status === "NOT_CONFIGURED" ? "text-earth-500" : "text-red-700"}`}>
                {normal ? "✅ 正常" : item.status === "NOT_CONFIGURED" ? "— 未設定" : "⚠️ 需檢查"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
