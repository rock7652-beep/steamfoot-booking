"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendLineSmokeTest } from "@/server/actions/reminder";

interface Props {
  storeName: string;
  customers: Array<{ id: string; name: string; phone: string }>;
}

export function LineSmokeTestCard({ storeName, customers }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setLastResult(null);

    try {
      const result = await sendLineSmokeTest({
        customerId: customerId || undefined,
        lineUserId: lineUserId || undefined,
      });

      if (result.success) {
        toast.success("已送出");
        setLastResult({
          status: "success",
          message: `已送出，請在 LINE 端確認來源是否為 ${result.data.storeName} 系統通知帳號。`,
        });
      } else {
        toast.error(result.error ?? "LINE 測試發送失敗");
        setLastResult({
          status: "error",
          message: result.error ?? "LINE 測試發送失敗",
        });
      }
    } catch {
      toast.error("LINE 測試發送失敗");
      setLastResult({ status: "error", message: "LINE 測試發送失敗" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/40 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-earth-900">LINE 系統通知測試</h3>
          <p className="mt-1 text-xs text-earth-500">
            預期來源：{storeName} LINE 系統通知帳號
          </p>
        </div>
        <span className="w-fit rounded bg-white px-2 py-1 text-[11px] font-medium text-primary-700">
          Preview safe
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="block">
          <span className="text-xs font-medium text-earth-700">已綁定顧客</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">不選擇</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} / {c.phone}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-earth-700">測試 lineUserId</span>
          <input
            value={lineUserId}
            onChange={(e) => setLineUserId(e.target.value.trim())}
            placeholder="同店已綁定顧客的 LINE userId"
            className="mt-1 h-10 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || (!customerId && !lineUserId)}
            className="h-10 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "送出中..." : "送出測試"}
          </button>
        </div>
      </form>

      <p className="mt-2 text-[11px] text-earth-400">
        內容：這是 {storeName} LINE 系統通知測試
      </p>

      {lastResult && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            lastResult.status === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {lastResult.message}
        </div>
      )}
    </div>
  );
}
