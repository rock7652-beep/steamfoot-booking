"use client";

/**
 * CareRowActions — 顧客經營每筆提醒的操作列（client）
 *
 * 顧客經營每筆提醒的操作列。
 *
 * 導向 / 純前端：
 *   1. 查看顧客   → /dashboard/customers?customerId=  開顧客 drawer（既有 deep link）
 *   2. 建立預約   → /dashboard/bookings/new           開建立預約頁
 *                  （目前建立預約頁尚未支援 customerId 預填,故不帶 query；
 *                    待後續小 PR 支援後再帶,本 PR 不擴大）
 *   3. 複製關心話術 → navigator.clipboard 純前端複製建議話術
 *
 * 寫入：
 *   4. 追蹤 → 新增 CustomerFollowUp 簡易追蹤紀錄
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { CUSTOMER_FOLLOW_UP_RESULT_OPTIONS } from "@/lib/customer-follow-up";
import { createCustomerFollowUpAction } from "@/server/actions/customer-follow-up";
import type { CustomerFollowUpResult } from "@prisma/client";

interface Props {
  customerId: string;
  /** 建議關心話術（依區塊不同,由 server 端帶入） */
  script: string;
}

const ACTION_CLASS =
  "rounded-md border border-earth-200 bg-white px-2 py-1 text-[11px] font-medium text-earth-700 transition hover:bg-earth-50";

export function CareRowActions({ customerId, script }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CustomerFollowUpResult>("CONTACTED");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪貼簿不可用（非 https / 權限）時不擋 UI,靜默略過
    }
  }

  function saveFollowUp() {
    setError(null);
    startTransition(async () => {
      const res = await createCustomerFollowUpAction({
        customerId,
        result,
        note,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setResult("CONTACTED");
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Link
          href={`/dashboard/customers?customerId=${customerId}`}
          className="rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-primary-700"
        >
          查看顧客
        </Link>
        <Link href="/dashboard/bookings/new" className={ACTION_CLASS}>
          建立預約
        </Link>
        <button type="button" onClick={copyScript} className={ACTION_CLASS}>
          {copied ? "已複製" : "複製話術"}
        </button>
        <button type="button" onClick={() => setOpen(true)} className={ACTION_CLASS}>
          追蹤
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-sm rounded-lg border border-earth-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-earth-900">新增追蹤紀錄</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-1.5 py-0.5 text-xs text-earth-500 hover:bg-earth-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
              >
                關閉
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-earth-700">追蹤結果</span>
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value as CustomerFollowUpResult)}
                  className="mt-1 w-full rounded-md border border-earth-200 bg-white px-3 py-2 text-sm text-earth-900 outline-none focus:border-primary-400"
                  disabled={isPending}
                >
                  {CUSTOMER_FOLLOW_UP_RESULT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-earth-700">備註</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-1 w-full resize-none rounded-md border border-earth-200 px-3 py-2 text-sm text-earth-900 outline-none focus:border-primary-400"
                  placeholder="選填"
                  disabled={isPending}
                />
              </label>

              {error ? <p className="text-xs text-red-600">{error}</p> : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={ACTION_CLASS}
                disabled={isPending}
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveFollowUp}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
              >
                {isPending ? "儲存中" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
