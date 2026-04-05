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
      <div className="mb-4 text-4xl">&#9888;</div>
      <h1 className="mb-2 text-lg font-bold text-earth-900">
        頁面載入失敗
      </h1>
      <p className="mb-6 max-w-sm text-sm text-earth-500">
        很抱歉，系統發生了問題。請重新嘗試或回到首頁。
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-700 hover:bg-earth-100"
        >
          重新載入
        </button>
        <Link
          href="/book"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
        >
          回到首頁
        </Link>
      </div>
      {process.env.NODE_ENV === "development" && error?.message && (
        <pre className="mt-6 max-w-lg overflow-auto rounded bg-red-50 p-3 text-left text-xs text-red-600">
          {error.message}
        </pre>
      )}
    </div>
  );
}
