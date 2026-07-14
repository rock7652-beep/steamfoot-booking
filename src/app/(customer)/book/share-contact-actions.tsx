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

interface Props {
  /** Server 取得的 Store.name */
  storeName: string;
  /** 推薦中繼頁 URL（由 buildReferralEntryUrl 組好） */
  referralUrl: string;
  /** Server 讀取的每店模板；null 使用系統預設 */
  shareTemplate?: string | null;
  /** @deprecated PR 2 起不送入 action；保留 prop 相容，待後續清理。 */
  storeId?: string;
  /** @deprecated PR 2 起不送入 action；保留 prop 相容，待後續清理。 */
  referrerId?: string;
}

export function ShareContactActions({
  storeName,
  referralUrl,
  shareTemplate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const absoluteUrl = toAbsoluteUrl(referralUrl);
  const shareText = buildShareText({
    storeName,
    url: absoluteUrl,
    template: shareTemplate,
  });
  const lineShareUrl = buildLineShareUrl(shareText);

  function trackShare(channel: "copy" | "line") {
    void trackCurrentCustomerShare({ source: `book-home:${channel}` });
  }

  async function handleCopy() {
    const ok = await copyToClipboard(shareText);
    if (!ok) {
      toast.error("無法複製分享文字，請稍後再試");
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
        {copied ? "已複製" : "複製分享文字"}
      </button>
    </div>
  );
}
