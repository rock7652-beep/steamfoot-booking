"use client";

import { useEffect } from "react";

/**
 * Auth route-group error boundary.
 *
 * 接住 (auth) 群組內任何 page / layout 的 server-side 例外（DB 連線、
 * NextAuth 內部錯誤、cookies 解析失敗等）。預設行為若沒這份檔，會掉到
 * Next.js 預設錯誤頁，使用者看不到任何上下文。
 *
 * 設計選擇：
 *   - production 不顯示 error.message / stack（避免洩漏 DB / 內部結構）
 *   - 只在 dev 模式顯示 message，方便開發除錯
 *   - digest 一律顯示，給使用者回報時對得到 server log
 *   - 用原生 <a> 而非 next/link，因為 (auth) 出錯時 router 狀態可能不穩
 *   - 不呼叫任何 hook 影響 navigation；只給「重新嘗試」與「回首頁」兩個動作
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AuthError]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 text-center shadow-sm sm:p-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-600"
        >
          <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          <path d="M12 15.75h.008v.008H12v-.008z" />
        </svg>
      </div>

      <h1 className="mb-2 text-lg font-bold text-earth-900">登入頁載入失敗</h1>
      <p className="mb-1 text-sm leading-relaxed text-earth-700">
        系統發生暫時性問題，請重新嘗試。
      </p>
      {error.digest && (
        <p className="mb-4 text-xs text-earth-400">
          錯誤代碼：{error.digest}
        </p>
      )}

      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={reset}
          className="block w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          重新嘗試
        </button>
        {/* 用原生 <a>，避免 router 狀態不穩時 Link 失效 */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="block w-full rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          回首頁
        </a>
        <a
          href="/hq/login"
          className="block text-xs text-earth-400 underline hover:text-earth-600"
        >
          回後台登入
        </a>
      </div>

      {isDev && error.message && (
        <pre className="mt-5 max-h-40 overflow-auto rounded-lg bg-red-50 p-3 text-left text-[11px] text-red-700">
          {error.message}
        </pre>
      )}
    </div>
  );
}
