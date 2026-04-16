"use client";

import { useState } from "react";

interface ShareReferralProps {
  referralUrl: string;
  /** 完整模式顯示連結文字 + 統計；精簡模式只顯示按鈕 */
  variant?: "full" | "compact";
  /** 已邀請人數（full 模式顯示） */
  referralCount?: number;
}

const SHARE_TEXT = "我最近在這邊做身體調整\n覺得還不錯，你可以試試看👇\n\n";

export function ShareReferral({ referralUrl, variant = "compact", referralCount }: ShareReferralProps) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = referralUrl.startsWith("http")
    ? referralUrl
    : `${typeof window !== "undefined" ? window.location.origin : ""}${referralUrl}`;

  const lineShareUrl = `https://line.me/R/share?text=${encodeURIComponent(SHARE_TEXT + absoluteUrl)}`;

  function handleCopy() {
    navigator.clipboard.writeText(absoluteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
