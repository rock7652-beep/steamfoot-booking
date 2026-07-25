"use client";

import { useState } from "react";
import {
  checkCurrentLineOfficialAccount,
  type LineOfficialAccountStatus,
} from "@/server/actions/line-official-accounts";

type Props = {
  initialStatus: LineOfficialAccountStatus;
};

export function StoreLineHealthCard({ initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    setPending(true);
    setError(null);
    const result = await checkCurrentLineOfficialAccount();
    if (result.success) setStatus(result.data);
    else setError(result.error ?? "無法完成 LINE 通知檢測");
    setPending(false);
  }

  const normal = status.status === "NORMAL";
  const notConfigured = status.status === "NOT_CONFIGURED";

  return (
    <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-earth-900">LINE 通知狀態</h3>
          <p className="mt-1 text-xs text-earth-500">檢查本店官方帳號連線與通知綁定。</p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={pending}
          className="h-9 rounded-lg border border-earth-200 bg-white px-4 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
        >
          {pending ? "檢測中…" : "重新檢測"}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-earth-50 px-3 py-2.5">
        <span className="text-sm text-earth-700">{status.storeName}</span>
        <span className={`text-sm font-semibold ${normal ? "text-green-700" : notConfigured ? "text-earth-500" : "text-red-700"}`}>
          {normal ? "✅ 通知正常" : notConfigured ? "— 尚未設定" : "⚠️ 需要檢查"}
        </span>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-[11px] text-earth-400">檢測不會傳送訊息，也不會顯示任何帳號密鑰。</p>
    </section>
  );
}
