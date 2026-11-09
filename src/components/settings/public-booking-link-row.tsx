"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/share";
import { SettingsListRow } from "./settings-workspace";

/** Public URLs only: secrets and store configuration stay on the server. */
export function PublicBookingLinkRow({ href }: { href: string | null }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  return <SettingsListRow title="公開預約 LINE 入口"
    summary={href ? "先驗證 LINE 再預約・分享與圖文選單使用同一連結" : "本店 LINE 入口尚未設定"}
    controls={href ? <>
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm text-primary-800">開啟</a>
      <button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-800"
        onClick={async () => setCopyState(await copyToClipboard(href) ? "copied" : "manual")}>複製連結</button>
    </> : undefined}>
    {copyState !== "idle" && <><p role="status" className="text-sm text-earth-600">{copyState === "copied" ? "已複製 LINE 入口連結" : copyState === "manual" ? "請選取下方連結後複製" : ""}</p>
    {href && copyState === "manual" && <input aria-label="公開預約 LINE 入口連結" readOnly value={href} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-earth-200 px-3 text-base" />}</>}
  </SettingsListRow>;
}
