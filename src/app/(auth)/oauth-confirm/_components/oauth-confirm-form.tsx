"use client";

import { useState, type FormEvent } from "react";
import { resolveLineLogin } from "@/server/actions/oauth-confirm";
import { normalizePhone } from "@/lib/normalize";

/**
 * /oauth-confirm 客戶端表單 — 單一手機輸入 + 結果分流
 *
 * 設計依據：docs/identity-flow.md §2（流程） + §4（文案）
 *
 * 結果分流（server 不做 redirect，全在這裡處理）：
 *   - NEW_USER / BOUND_EXISTING（含 action: "RELOGIN"）→ /api/auth/signin?callbackUrl=...
 *     使用者明確點 LINE 按鈕完成 signin（不自動跳 LINE OAuth，避免 loop）
 *   - NEED_LOGIN → 導向 /login 帶 phone + callback=/oauth-confirm/finalize
 *   - BLOCKED_NEEDS_STAFF → 顯示「請聯繫店家」訊息，不導頁
 *   - 各種 error → 顯示對應人話訊息
 *
 * RELOGIN 原則（見 memory feedback_nextauth_session_refresh）：
 *   server 寫完 DB 後不能回傳新 session（NextAuth JWT 不會自動更新）；
 *   唯一穩定解是讓使用者走完整 /api/auth/signin，重建 JWT。
 */

interface Props {
  callbackUrl: string;
}

export function OAuthConfirmForm({ callbackUrl }: Props) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);
    if (!/^09\d{8}$/.test(normalized)) {
      setError("請輸入正確的手機號碼（09 開頭 10 碼）");
      return;
    }

    setPending(true);
    try {
      const result = await resolveLineLogin({ phone: normalized });

      if ("error" in result) {
        setPending(false);
        switch (result.error) {
          case "session_expired":
            setError("登入流程已過期，請重新從 LINE 登入");
            break;
          case "invalid_phone":
            setError("請輸入正確的手機號碼（09 開頭 10 碼）");
            break;
          case "line_already_bound_other":
            setError(
              "此手機號碼已綁定其他 LINE 帳號。如需更換，請先聯繫店家解除原綁定。",
            );
            break;
        }
        return;
      }

      // 四種狀態的 client 分流
      switch (result.status) {
        case "NEW_USER":
        case "BOUND_EXISTING":
          // lineUserId 已寫入 DB → RELOGIN 觸發 NextAuth 重建 JWT。
          // 不用 /api/auth/signin/line（自動跳）— 避免 loop / callbackUrl 混亂；
          // 改用 /api/auth/signin（provider 選擇頁），使用者明確點 LINE 完成。
          setTransitioning("正在完成 LINE 登入…");
          window.location.href = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
          break;
        case "NEED_LOGIN": {
          // 已啟用顧客 → 強制密碼登入；登入後 finalize 才寫 lineUserId
          setTransitioning("此手機已有會員資料，正在帶你完成 LINE 綁定…");
          // 用 /oauth-confirm/login（自有頁面）而非 /login（後台 email 登入）
          const loginUrl = `/oauth-confirm/login?phone=${encodeURIComponent(result.phone)}&customerId=${encodeURIComponent(result.customerId)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
          window.location.href = loginUrl;
          break;
        }
        case "BLOCKED_NEEDS_STAFF":
          // 占位符 + 已預載資產（wallet/booking/...）→ 不可 silent claim
          setError(
            "此手機已有店家建立的會員資料，請聯繫店家協助綁定 LINE。",
          );
          break;
      }
    } catch {
      setPending(false);
      setError("操作失敗，請稍後再試");
    }
  }

  if (transitioning) {
    return (
      <div className="rounded-md bg-blue-50 px-3 py-3 text-center">
        <p className="text-sm text-blue-800">{transitioning}</p>
        <p className="mt-1 text-xs text-blue-600">頁面即將跳轉⋯</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="phone" className="block text-xs font-medium text-earth-700">
          手機號碼
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="請輸入手機號碼（用於確認會員）"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={pending}
          className="mt-1 w-full rounded-md border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-earth-50"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "確認中⋯" : "繼續 →"}
      </button>

      <p className="text-center text-[11px] text-earth-400">
        我們僅用手機號碼比對既有會員，不會發送驗證簡訊。
      </p>
    </form>
  );
}
