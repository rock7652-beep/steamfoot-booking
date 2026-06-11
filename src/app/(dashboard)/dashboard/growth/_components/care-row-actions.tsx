"use client";

/**
 * CareRowActions — 顧客經營每筆提醒的操作列（client）
 *
 * 三個動作,皆為「導向 / 純前端」,不寫 DB:
 *   1. 查看顧客   → /dashboard/customers?customerId=  開顧客 drawer（既有 deep link）
 *   2. 建立預約   → /dashboard/bookings/new           開建立預約頁
 *                  （目前建立預約頁尚未支援 customerId 預填,故不帶 query；
 *                    待後續小 PR 支援後再帶,本 PR 不擴大）
 *   3. 複製關心話術 → navigator.clipboard 純前端複製建議話術,不寫任何紀錄
 *                  （「已聯繫 / 追蹤紀錄」是 PR-2D 才做,本 PR 絕不寫入）
 */

import { useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";

interface Props {
  customerId: string;
  /** 建議關心話術（依區塊不同,由 server 端帶入） */
  script: string;
}

const ACTION_CLASS =
  "rounded-md border border-earth-200 bg-white px-2 py-1 text-[11px] font-medium text-earth-700 transition hover:bg-earth-50";

export function CareRowActions({ customerId, script }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪貼簿不可用（非 https / 權限）時不擋 UI,靜默略過
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
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
        {copied ? "已複製 ✓" : "複製話術"}
      </button>
    </div>
  );
}
