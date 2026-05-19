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

interface Props {
  /** 推薦中繼頁 URL（由 buildReferralEntryUrl 組好） */
  referralUrl: string;
  /** 店家 ID — 用於分享事件埋點 */
  storeId?: string;
  /** 顧客 ID — 用於分享事件埋點 */
  referrerId?: string;
}

export function ShareContactActions({
  referralUrl,
  storeId,
  referrerId,
}: Props) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = toAbsoluteUrl(referralUrl);
  // 分享文字與 my-referrals 完全一致：URL 內嵌於文案中間
  const shareText = buildShareText({ url: absoluteUrl });
  const lineShareUrl = buildLineShareUrl(shareText);

  function trackShare(channel: "copy" | "line") {
    if (!storeId || !referrerId) return;
    void trackReferralEvent({
      storeId,
      referrerId,
      type: "SHARE",
      source: `book-home:${channel}`,
    });
  }

  async function handleCopy() {
    const ok = await copyToClipboard(absoluteUrl);
    if (!ok) {
      toast.error("無法複製，請長按連結手動複製");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    trackShare("copy");
    toast.success("已複製，傳給朋友就可以囉");
  }

  function handleLineShareClick() {
    trackShare("line");
    toast.success("已幫你準備好了，傳給想到的朋友就可以。");
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <a
        href={lineShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLineShareClick}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#06C755] text-[15px] font-semibold text-white hover:bg-[#05b54d]"
      >
        立即用 LINE 分享
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="h-11 w-full rounded-xl border border-earth-300 bg-white text-[15px] font-semibold text-earth-800 hover:bg-earth-50"
      >
        {copied ? "已複製" : "複製連結"}
      </button>
    </div>
  );
}
