"use client";

import { useState } from "react";
import {
  buildShareText,
  buildLineShareUrl,
  copyToClipboard,
  toAbsoluteUrl,
} from "@/lib/share";

interface ShareReferralProps {
  /** 推薦中繼頁 URL（應由呼叫端用 buildReferralEntryUrl 組好） */
  referralUrl: string;
  /** 完整模式顯示連結文字 + 統計；精簡模式只顯示按鈕 */
  variant?: "full" | "compact";
  /** 已邀請人數（full 模式顯示） */
  referralCount?: number;
  /** 邀請人姓名（預設文案目前不帶入，保留給未來 A/B） */
  inviterName?: string | null;
}

export function ShareReferral({
  referralUrl,
  variant = "compact",
  referralCount,
  inviterName,
}: ShareReferralProps) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = toAbsoluteUrl(referralUrl);
  const shareText = buildShareText({ inviterName });
  const lineShareUrl = buildLineShareUrl(shareText, absoluteUrl);

  async function handleCopy() {
    const ok = await copyToClipboard(absoluteUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (variant === "full") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-earth-500">你的專屬邀請連結：</p>
        <div className="rounded-lg border border-earth-200 bg-earth-50 px-3 py-2">
          <p className="break-all text-xs text-earth-600 font-mono">{absoluteUrl}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-700 hover:bg-earth-50"
          >
            {copied ? "已複製" : "複製連結"}
          </button>
          <a
            href={lineShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-[#06C755] px-3 py-2 text-center text-sm font-medium text-white hover:bg-[#05b54d]"
          >
            LINE 分享
          </a>
        </div>
        {typeof referralCount === "number" && (
          <p className="text-sm text-earth-500">你已邀請：{referralCount} 人</p>
        )}
      </div>
    );
  }

  // compact: 分享選單按鈕組
  return (
    <div className="flex gap-2">
      <button
        onClick={handleCopy}
        className="flex-1 rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-700 hover:bg-earth-50"
      >
        {copied ? "已複製" : "複製連結"}
      </button>
      <a
        href={lineShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 rounded-lg bg-[#06C755] px-3 py-2 text-center text-sm font-medium text-white hover:bg-[#05b54d]"
      >
        LINE 分享
      </a>
    </div>
  );
}
