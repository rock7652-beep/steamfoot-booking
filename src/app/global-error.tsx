"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary.
 *
 * Replaces the root layout when an error is thrown inside the root layout
 * itself or before any nested error boundary mounts. Must therefore render
 * its own <html> / <body> shell.
 *
 * Keep the UI deliberately minimal — no Tailwind, no shared components,
 * no fonts. global-error.tsx fires when the rest of the tree may have
 * failed to load, so we cannot rely on anything else having booted.
 *
 * Do NOT surface error.message / stack to the user — only the digest
 * so they can quote it when reporting. Server-side log retains the truth.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafaf7",
          color: "#3a3a36",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#ffffff",
            border: "1px solid #e6e2d6",
            borderRadius: "12px",
            padding: "32px 24px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: "20px",
              fontWeight: 700,
              color: "#1f1f1c",
            }}
          >
            系統暫時無法使用
          </h1>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: "14px",
              lineHeight: 1.7,
              color: "#5b5b54",
            }}
          >
            載入時發生問題，請稍候再試。若狀況持續，請聯繫管理員。
          </p>
          {error.digest && (
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "12px",
                color: "#8a8a82",
              }}
            >
              錯誤代碼：{error.digest}
            </p>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                width: "100%",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#ffffff",
                background: "#a37c52",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              重新嘗試
            </button>
            {/* global-error 替換整個 root layout — Next 客戶端 router 可能未啟動 */}
            {/* 必須用原生 <a> 觸發完整 page navigation，不可用 next/link */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                width: "100%",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#5b5b54",
                background: "#ffffff",
                border: "1px solid #d6d2c4",
                borderRadius: "8px",
                textDecoration: "none",
                boxSizing: "border-box",
              }}
            >
              回首頁
            </a>
            <a
              href="/hq/login"
              style={{
                fontSize: "12px",
                color: "#8a8a82",
                textDecoration: "underline",
                marginTop: "4px",
              }}
            >
              回後台登入
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
