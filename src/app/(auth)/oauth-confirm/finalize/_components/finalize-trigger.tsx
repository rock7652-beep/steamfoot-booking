"use client";

import { useEffect, useRef, useState } from "react";
import { finalizeLineBind } from "@/server/actions/oauth-confirm";

/**
 * /oauth-confirm/finalize 客戶端 trigger
 *
 * onMount 自動 call finalizeLineBind 寫 lineUserId（temp session 在 NEED_LOGIN 路徑
 * 一直保留到現在）。成功後 RELOGIN：window.location.href = /api/auth/signin?callbackUrl=...
 *
 * 用 ref 防 React Strict Mode 雙呼叫（dev 環境 useEffect 會跑兩次）。
 */

interface Props {
  customerId: string;
  callbackUrl: string;
}

type State =
  | { kind: "binding" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: "登入流程已過期，請重新從 LINE 登入。",
  auth_required: "需要先登入才能完成綁定。",
  customer_mismatch: "資料不一致，請重新從 LINE 登入流程開始。",
  line_already_bound_other: "此 LINE 帳號已綁定其他會員，無法重複綁定。",
};

export function FinalizeTrigger({ customerId, callbackUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "binding" });
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    finalizeLineBind({ customerId, callbackUrl })
      .then((result) => {
        if ("error" in result) {
          setState({
            kind: "error",
            message: ERROR_MESSAGES[result.error] ?? "綁定失敗，請稍後再試。",
          });
          return;
        }
        // RELOGIN — 走 NextAuth signin 重建 JWT 取得新身份
        setState({ kind: "success" });
        window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent(result.callbackUrl)}`;
      })
      .catch(() => {
        setState({ kind: "error", message: "綁定失敗，請稍後再試。" });
      });
  }, [customerId, callbackUrl]);

  if (state.kind === "binding" || state.kind === "success") {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-earth-900">正在完成 LINE 綁定…</p>
        <p className="mt-1 text-xs text-earth-500">
          {state.kind === "success" ? "頁面即將跳轉⋯" : "請稍候，不要關閉視窗。"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-base font-semibold text-red-700">綁定失敗</h1>
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.message}
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/auth/signin/line"
        className="mt-4 inline-block rounded-md bg-[#06C755] px-4 py-2 text-sm font-medium text-white hover:bg-[#05b04c]"
      >
        重新登入
      </a>
    </div>
  );
}
