"use client";

/**
 * WalletSummaryBar + `WalletSummary` type 從 member-booking-form.tsx 拆出
 * (P1-5b 結構拆分).
 *
 * 純 presentational：接 wallet 資料 → 渲染「目前可預約 X 堂」+ 多張方案時加
 * 「共 N 張方案」副文。`WalletSummary` type 在這檔 export，由 main 與其他
 * sub-component（NoWalletCard / BlockedBlock 不需要；僅 main 持有 state）re-import。
 */

import { liffMessages } from "@/lib/liff/messages";

export type WalletSummary = {
  totalAvailable: number;
  activePlanCount: number;
};

// ──────────────────────────────────────────────────────────
// Wallet summary bar — readonly
// 「目前可預約 X 堂」+ 多張方案時加「共 N 張方案」
// ──────────────────────────────────────────────────────────

export function WalletSummaryBar({ wallet }: { wallet: WalletSummary }) {
  const m = liffMessages.memberBooking;
  return (
    <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3 text-sm text-earth-800">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-earth-600">{m.walletSummaryPrefix}</span>
        <span>
          <strong className="text-xl font-bold tabular-nums text-earth-900">
            {wallet.totalAvailable}
          </strong>
          <span className="ml-1 text-xs text-earth-700">
            {m.walletSummarySuffix}
          </span>
        </span>
      </div>
      {wallet.activePlanCount > 1 && (
        <p className="mt-1 text-right text-[11px] text-earth-500">
          {m.walletSummaryMultiPlan.replace(
            "{count}",
            String(wallet.activePlanCount),
          )}
        </p>
      )}
    </div>
  );
}
