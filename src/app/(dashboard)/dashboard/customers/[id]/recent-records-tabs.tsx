"use client";

import { useState } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";

/**
 * RecentRecordsTabs — 顧客詳情頁「最近紀錄」分頁切換（預約紀錄 / 消費紀錄）
 *
 * 純前端 UI：把原本上下兩張卡（預約紀錄、消費紀錄）整併成一張 compact 卡，
 * 用 tab 切換降低頁面長度。表格內容仍由 server 預先 render 後以 ReactNode
 * 傳入，這裡只負責顯示/隱藏，不改任何資料流。
 *
 * 所有 tab 的內容都會 render（非 active 以 hidden 隱藏），確保 server 端
 * 預先算好的節點不會被卸載重算，連結與互動行為與原本完全一致。
 */

export interface RecentRecordsTab {
  key: string;
  label: string;
  count: number;
  href: string;
  content: React.ReactNode;
}

export function RecentRecordsTabs({ tabs }: { tabs: RecentRecordsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <section className="rounded-xl border border-earth-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-1">
          {tabs.map((t) => {
            const isActive = t.key === activeTab?.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary-50 text-primary-700"
                    : "text-earth-500 hover:bg-earth-50 hover:text-earth-700"
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    isActive
                      ? "bg-primary-100 text-primary-700"
                      : "bg-earth-100 text-earth-500"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        {activeTab?.href ? (
          <Link
            href={activeTab.href}
            className="shrink-0 text-[11px] text-primary-600 hover:text-primary-700"
          >
            查看全部 →
          </Link>
        ) : null}
      </div>
      <div className="border-t border-earth-100">
        {tabs.map((t) => (
          <div key={t.key} className={t.key === activeTab?.key ? "block" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </section>
  );
}
