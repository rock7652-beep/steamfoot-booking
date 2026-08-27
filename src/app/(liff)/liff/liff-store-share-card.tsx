"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  copyToClipboard,
  toAbsoluteUrl,
} from "@/lib/share";
import { shareViaTargetPicker } from "@/lib/liff/client";
import { buildLiffStoreShareMessages } from "@/lib/liff/store-share-message";
import { trackCurrentCustomerShare } from "@/server/actions/referral-events";
import type { LiffReferralShareContext } from "@/server/actions/liff-referral-share";

export function LiffStoreShareCard({
  context,
}: {
  context: LiffReferralShareContext;
}) {
  const [sharing, setSharing] = useState(false);

  async function copyFallback(referralUrl: string) {
    const copied = await copyToClipboard(referralUrl);
    if (!copied) {
      toast.error("目前無法開啟分享，請稍後再試");
      return;
    }
    void trackCurrentCustomerShare({ source: "liff-store-share:copy" });
    toast.success("分享連結已複製，可以傳給好友了");
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    const referralUrl = toAbsoluteUrl(context.referralUrl);
    try {
      const result = await shareViaTargetPicker(
        buildLiffStoreShareMessages({
          ...context,
          referralUrl,
        }),
      );
      if (result === "success") {
        void trackCurrentCustomerShare({
          source: "liff-store-share:picker",
        });
        toast.success("已分享給好友");
        return;
      }
      if (result === "unavailable") {
        await copyFallback(referralUrl);
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white px-5 py-5 shadow-[0_6px_18px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70">
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700"
          aria-hidden
        >
          <ShareIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-earth-900">
            喜歡這家店？分享給好友
          </h2>
          <p className="mt-1 text-sm leading-6 text-earth-500">
            直接用 LINE 傳送店家介紹與體驗預約。
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 px-4 text-sm font-semibold text-primary-800 transition hover:bg-primary-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
      >
        {sharing ? "正在開啟 LINE 分享…" : "分享店家給好友"}
      </button>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M8.5 12.8 15.7 8m-7.2 3.2 7.2 4.8M6 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12-7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
