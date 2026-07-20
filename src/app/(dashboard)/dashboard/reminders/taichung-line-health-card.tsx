"use client";

import { useState } from "react";
import { checkTaichungLineBotHealth, type TaichungLineBotHealth } from "@/server/actions/line-health";

export function TaichungLineHealthCard() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TaichungLineBotHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkHealth() {
    setPending(true);
    setError(null);
    const response = await checkTaichungLineBotHealth();
    if (response.success) setResult(response.data);
    else setError(response.error ?? "無法完成台中 OA 健康檢查");
    setPending(false);
  }

  const passed = result?.status === "PASS";
  return <section className="rounded-xl border border-primary-200 bg-primary-50/40 p-5">
    <h3 className="text-sm font-semibold text-earth-900">台中 OA Token 健康檢查</h3>
    <p className="mt-1 text-xs text-earth-500">只驗證台中系統通知帳號身分；不會發送訊息或變更任何資料。</p>
    <button onClick={checkHealth} disabled={pending} className="mt-3 h-9 rounded-lg bg-primary-600 px-3 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "檢查中…" : "執行唯讀檢查"}
    </button>
    {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    {result && <div className={`mt-3 rounded-lg border p-3 text-xs ${passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <p className="font-medium">驗證{passed ? "成功" : "失敗"}</p>
      <p className="mt-1">OA 顯示名稱：{result.displayName ?? "—"}</p>
      <p>Basic ID：{result.basicId ?? "—"}</p>
      <p>是否符合台中店：{result.matchesTaichungStore ? "是" : "否"}</p>
      <p>檢查時間：{new Date(result.checkedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </div>}
  </section>;
}
