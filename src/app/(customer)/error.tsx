"use client";

import Link from "next/link";
import { useStoreSlugRequired } from "@/lib/store-context";

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const storeSlug = useStoreSlugRequired();
  const prefix = `/s/${storeSlug}`;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
          <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path d="M12 15.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="mb-3 text-2xl font-bold text-earth-900">
        頁面載入失敗
      </h1>
      <p className="mb-6 max-w-sm text-base leading-relaxed text-earth-800">
        很抱歉，系統發生了問題。請重新嘗試或回到首頁。
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="min-h-[48px] rounded-xl border border-earth-300 px-6 text-base font-semibold text-earth-800 transition hover:bg-earth-100"
        >
          重新載入
        </button>
        <Link
          href={`${prefix}/book`}
          className="flex min-h-[48px] items-center justify-center rounded-xl bg-primary-600 px-6 text-base font-semibold text-white transition hover:bg-primary-700"
        >
          回到首頁
        </Link>
      </div>
      {process.env.NODE_ENV === "development" && error?.message && (
        <pre className="mt-6 max-w-lg overflow-auto rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
          {error.message}
        </pre>
      )}
    </div>
  );
}
