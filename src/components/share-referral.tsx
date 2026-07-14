"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  buildShareText,
  buildLineShareUrl,
  copyToClipboard,
  toAbsoluteUrl,
} from "@/lib/share";
import { trackCurrentCustomerShare } from "@/server/actions/referral-events";

interface ShareReferralProps {
  /** Server 取得的 Store.name */
  storeName: string;
  /** 推薦中繼頁 URL（應由呼叫端用 buildReferralEntryUrl 組好） */
  referralUrl: string;
  /** 完整模式顯示連結文字 + 統計；精簡模式只顯示按鈕 */
  variant?: "full" | "compact";
  /** 已邀請人數（full 模式顯示） */
  referralCount?: number;
  /** 邀請人姓名（預設文案目前不帶入，保留給未來 A/B） */
  inviterName?: string | null;
  /** @deprecated PR 2 起不送入 action；保留 prop 相容，待後續清理。 */
  storeId?: string;
  /** @deprecated PR 2 起不送入 action；保留 prop 相容，待後續清理。 */
  referrerId?: string;
  /** 分享事件來源標記，例如 "my-referrals", "book-home", "booking-success" */
  source?: string;
}

export function ShareReferral({
  storeName,
  referralUrl,
  variant = "compact",
  referralCount,
  inviterName,
  source,
}: ShareReferralProps) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = toAbsoluteUrl(referralUrl);
  const shareText = buildShareText({ storeName, inviterName, url: absoluteUrl });
  const lineShareUrl = buildLineShareUrl(shareText);

  function trackShare(channel: "copy" | "line") {
    void trackCurrentCustomerShare({
      source: source ? `${source}:${channel}` : channel,
    });
  }

  async function handleCopy() {
    const ok = await copyToClipboard(shareText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackShare("copy");
      toast.success("已幫你準備好了，傳給想到的朋友就可以。");
    }
  }

  function handleLineShareClick() {
    trackShare("line");
    toast.success("已幫你準備好了，傳給想到的朋友就可以。");
  }

  if (variant === "full") {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium text-earth-800">你的專屬邀請連結：</p>
        <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-3">
          <p className="break-all text-sm text-earth-800 font-mono">{absoluteUrl}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleCopy}
            className="flex-1 min-h-[48px] rounded-xl border border-earth-300 bg-white px-4 text-base font-semibold text-earth-800 hover:bg-earth-50"
          >
            {copied ? "已複製" : "複製分享文字"}
          </button>
          <a
            href={lineShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLineShareClick}
            className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-semibold text-white hover:bg-[#05b54d]"
          >
            立即用 LINE 分享
          </a>
        </div>
        {typeof referralCount === "number" && (
          <p className="text-base text-earth-700">你已邀請：{referralCount} 人</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        onClick={handleCopy}
        className="flex-1 min-h-[48px] rounded-xl border border-earth-300 bg-white px-4 text-base font-semibold text-earth-800 hover:bg-earth-50"
      >
        {copied ? "已複製" : "複製分享文字"}
      </button>
      <a
        href={lineShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLineShareClick}
        className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-semibold text-white hover:bg-[#05b54d]"
      >
        立即用 LINE 分享
      </a>
    </div>
  );
}
