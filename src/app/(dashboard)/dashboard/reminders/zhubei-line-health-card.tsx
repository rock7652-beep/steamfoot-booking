"use client";

import { useState } from "react";
import { checkZhubeiLineBotHealth, type ZhubeiLineBotHealth } from "@/server/actions/line-health";

export function ZhubeiLineHealthCard() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ZhubeiLineBotHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkHealth() {
    setPending(true);
    setError(null);
    const response = await checkZhubeiLineBotHealth();
    if (response.success) setResult(response.data);
    else setError(response.error ?? "無法完成竹北 OA 健康檢查");
    setPending(false);
  }

  const passed = result?.status === "PASS";
  const reviewing = result?.status === "REVIEW";
  return <section className="rounded-xl border border-primary-200 bg-primary-50/40 p-5">
    <h3 className="text-sm font-semibold text-earth-900">竹北 OA Token 身分檢查</h3>
    <p className="mt-1 text-xs text-earth-500">使用竹北專屬 Production Token 讀取 LINE Bot Info。首次確認只顯示身分資料，不發送訊息、不變更顧客資料，也不會在尚未核准 Basic ID 前修改店別對應。</p>
    <button onClick={checkHealth} disabled={pending} className="mt-3 h-9 rounded-lg bg-primary-600 px-3 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "檢查中…" : "檢查竹北 OA 身分"}
    </button>
    {error && <p className="mt-3 text-xs text-red-700">{error}</p>}
    {result && <div className={`mt-3 rounded-lg border p-3 text-xs ${passed ? "border-green-200 bg-green-50" : reviewing ? "border-yellow-200 bg-yellow-50" : "border-red-200 bg-red-50"}`}>
      <p className="font-medium">{passed ? "驗證成功" : reviewing ? "等待核准身分" : "驗證失敗"}</p>
      <p className="mt-1">OA 顯示名稱：{result.displayName ?? "—"}</p>
      <p>Basic ID：{result.basicId ?? "—"}</p>
      <p>Bot User ID：{result.botUserId ?? "—"}</p>
      <p>目前 Store.lineDestination 是否一致：{result.destinationMatches === null ? "無法判定" : result.destinationMatches ? "是" : "否"}</p>
      {reviewing && <p className="mt-1 font-medium text-yellow-800">請先確認上方顯示名稱與 Basic ID 確實屬於竹北「暖暖蒸足」。本次不會自動修正 destination。</p>}
      {result.repairedDestination && <p className="font-medium text-green-700">已修復竹北店 Webhook 對應</p>}
      <p>檢查時間：{new Date(result.checkedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>
    </div>}
  </section>;
}
