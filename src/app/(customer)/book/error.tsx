"use client";

import Link from "next/link";

export default function CustomerBookError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const match =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/s\/([^/]+)/)
      : null;
  const storeSlug = match?.[1] ?? "zhubei";

  return (
    <section className="flex min-h-[55vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-earth-900">會員首頁載入失敗</h1>
        <p className="mt-3 text-sm leading-6 text-earth-700">
          系統暫時無法載入首頁資料。您的方案與堂數不會因此消失，請重新載入或重新登入。
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            重新載入
          </button>
          <Link
            href={`/s/${storeSlug}/`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-earth-200 px-5 text-sm font-semibold text-earth-700 hover:bg-earth-50"
          >
            回到登入頁
          </Link>
        </div>
      </div>
    </section>
  );
}
