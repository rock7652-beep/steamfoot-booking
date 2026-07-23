"use client";

import { useState } from "react";

export function InviteButton({
  customerName,
  inviteUrl,
}: {
  customerName: string;
  inviteUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    const message = `${customerName}您好，為了讓您在不同門市都能使用同一個會員帳號並正確收到通知，請登入後完成會員資料連結：${inviteUrl}`;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copyInvite}
      className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
    >
      {copied ? "已複製邀請" : "複製補綁邀請"}
    </button>
  );
}

