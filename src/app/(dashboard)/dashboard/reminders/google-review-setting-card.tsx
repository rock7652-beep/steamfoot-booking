"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateGoogleReviewUrl } from "@/server/actions/google-review";

export function GoogleReviewSettingCard({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [saved, setSaved] = useState(initialUrl);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = url.trim();
    startTransition(async () => {
      const result = await updateGoogleReviewUrl(next || null);
      if (!result.success) {
        toast.error(result.error ?? "儲存失敗");
        return;
      }
      setSaved(next);
      toast.success("Google 評論網址已儲存");
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-5">
      <h2 className="text-base font-semibold text-earth-900">Google 評論邀請</h2>
      <p className="mt-1 text-sm text-earth-500">
        店長完成服務後，可從該筆預約的「⋯ 更多操作」視情況傳送 LINE 邀請。
      </p>
      <label className="mt-4 block text-xs font-medium text-earth-600" htmlFor="google-review-url">
        此分店的 Google 評論網址
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="google-review-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="貼上 Google 商家檔案的「邀請評論」連結"
          className="h-10 min-w-0 flex-1 rounded-lg border border-earth-300 px-3 text-sm outline-none focus:border-primary-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || url.trim() === saved}
          className="h-10 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}
