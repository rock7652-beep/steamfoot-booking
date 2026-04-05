"use client";

import Link from "next/link";

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
          <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path d="M12 15.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="mb-1.5 text-lg font-semibold text-earth-900">
        頁面載入失敗
      </h1>
      <p className="mb-6 max-w-sm text-sm text-earth-500">
        很抱歉，系統發生了問題。請重新嘗試或回到首頁。
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-700 transition hover:bg-earth-100"
        >
          重新載入
        </button>
        <Link
          href="/book"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white transition hover:bg-primary-700"
        >
          回到首頁
        </Link>
      </div>
      {process.env.NODE_ENV === "development" && error?.message && (
        <pre className="mt-6 max-w-lg overflow-auto rounded-lg bg-red-50 p-3 text-left text-xs text-red-600">
          {error.message}
        </pre>
      )}
    </div>
  );
}
