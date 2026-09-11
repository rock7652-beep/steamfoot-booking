"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function BookingLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section role="alert" aria-busy={pending} className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="text-lg font-semibold text-earth-900">預約資料暫時載入失敗</h2>
      <p className="mt-2 text-base leading-relaxed text-earth-700">
        目前無法確認本月預約，這不代表沒有預約。請重新載入後，再核對可接待的時段。
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "重新載入中…" : "重新載入"}
      </button>
      <p className="mt-3 text-sm text-earth-600">若持續無法載入，請聯繫系統協助，先不要將空白畫面當成可預約時段。</p>
    </section>
  );
}
