"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  buildShareText,
  buildLineShareUrl,
  copyToClipboard,
  toAbsoluteUrl,
} from "@/lib/share";
import { trackReferralEvent } from "@/server/actions/referral-events";

interface ShareReferralProps {
  /** 推薦中繼頁 URL（應由呼叫端用 buildReferralEntryUrl 組好） */
  referralUrl: string;
  /** 完整模式顯示連結文字 + 統計；精簡模式只顯示按鈕 */
  variant?: "full" | "compact";
  /** 已邀請人數（full 模式顯示） */
  referralCount?: number;
  /** 邀請人姓名（預設文案目前不帶入，保留給未來 A/B） */
  inviterName?: string | null;
  /** 分享人的 store（用於事件埋點） */
  storeId?: string;
  /** 分享人的 customer id（用於事件埋點） */
  referrerId?: string;
  /** 分享事件來源標記，例如 "my-referrals", "book-home", "booking-success" */
  source?: string;
}

export function ShareReferral({
  referralUrl,
  variant = "compact",
  referralCount,
  inviterName,
  storeId,
  referrerId,
  source,
}: ShareReferralProps) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = toAbsoluteUrl(referralUrl);
  // v2: URL 已內嵌於 shareText 中間
  const shareText = buildShareText({ inviterName, url: absoluteUrl });
  const lineShareUrl = buildLineShareUrl(shareText);
  // 複製分享文字 = LINE 分享出去的文字（完全一致）
  const fullShareText = shareText;

  /** 分享事件埋點（fire-and-forget；埋點失敗不影響使用者體驗） */
  function trackShare(channel: "copy" | "line") {
    if (!storeId || !referrerId) return;
    // 不 await；trackReferralEvent 本身靜默失敗
    void trackReferralEvent({
      storeId,
      referrerId,
      type: "SHARE",
      source: source ? `${source}:${channel}` : channel,
    });
  }

  async function handleCopy(mode: "url" | "text" = "url") {
    const payload = mode === "text" ? fullShareText : absoluteUrl;
    const ok = await copyToClipboard(payload);
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
            onClick={() => handleCopy("text")}
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

  // compact: 分享選單按鈕組
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        onClick={() => handleCopy("url")}
        className="flex-1 min-h-[48px] rounded-xl border border-earth-300 bg-white px-4 text-base font-semibold text-earth-800 hover:bg-earth-50"
      >
        {copied ? "已複製" : "複製連結"}
      </button>
      <a
        href={lineShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-semibold text-white hover:bg-[#05b54d]"
      >
        立即用 LINE 分享
      </a>
    </div>
  );
}
