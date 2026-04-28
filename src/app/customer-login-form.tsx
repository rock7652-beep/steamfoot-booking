"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  customerLoginAction,
  type CustomerLoginState,
} from "@/server/actions/customer-auth";
import {
  checkPhoneStatus,
  type PhoneStatus,
} from "@/server/actions/account";

type Step = "phone" | "password" | "needs_activation";

export function CustomerLoginForm({
  storeSlug = "zhubei",
  storeId,
}: {
  storeSlug?: string;
  /**
   * 可省略；省略時 server action 會 fallback 到 cookie/slug resolver。
   * 不再用 "default-store" 字串當 default，避免在多店環境（store id 為 UUID）
   * 把查詢打到不存在的 storeId、被誤判成「尚未註冊」。
   */
  storeId?: string;
}) {
  const prefix = `/s/${storeSlug}`;
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<PhoneStatus | null>(null);
  const [checking, startCheck] = useTransition();

  // Password step uses server action
  const [loginState, loginAction, loginPending] = useActionState<
    CustomerLoginState,
    FormData
  >(customerLoginAction, { error: null });

  function handlePhoneCheck() {
    const trimmed = phone.trim();
    if (!/^09\d{8}$/.test(trimmed)) {
      setPhoneError("請輸入正確的手機號碼（09 開頭共 10 碼）");
      return;
    }
    setPhoneError(null);

    startCheck(async () => {
      const result = await checkPhoneStatus(trimmed, storeId);
      setStatusInfo(result);
      switch (result.status) {
        case "not_found":
          setPhoneError("此手機號碼尚未註冊");
          break;
        case "needs_activation":
          setStep("needs_activation");
          break;
        case "active":
          setStep("password");
          break;
      }
    });
  }

  // ── Step 1: Phone input ──
  if (step === "phone") {
    return (
      <div className="space-y-4">
        {phoneError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <p>{phoneError}</p>
            {statusInfo?.status === "not_found" && (
              <Link
                href={`${prefix}/register`}
                className="mt-1 inline-block font-medium text-primary-600 hover:underline"
              >
                前往註冊 →
              </Link>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-earth-700"
          >
            手機號碼
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="0912345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handlePhoneCheck();
              }
            }}
            className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <button
          type="button"
          onClick={handlePhoneCheck}
          disabled={checking}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {checking ? "確認中..." : "下一步"}
        </button>
      </div>
    );
  }

  // ── Step: Needs Activation ──
  if (step === "needs_activation" && statusInfo?.status === "needs_activation") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm font-medium text-yellow-800">
            店家已有您的會員資料
          </p>
          <p className="mt-1 text-xs text-yellow-700">
            {statusInfo.customerName}，請設定密碼啟用帳號。
          </p>
        </div>

        <Link
          href={`${prefix}/activate?phone=${encodeURIComponent(phone.trim())}`}
          className="block w-full rounded-lg bg-primary-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-700"
        >
          設定密碼並登入
        </Link>

        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setStatusInfo(null);
          }}
          className="w-full text-center text-sm text-earth-500 hover:text-earth-700"
        >
          ← 返回
        </button>
      </div>
    );
  }

  // ── Step: Password ──
  return (
    <form action={loginAction} className="space-y-4">
      {loginState.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {loginState.error}
        </p>
      )}

      <div className="rounded-lg bg-earth-50 px-3 py-2">
        <p className="text-xs text-earth-500">手機號碼</p>
        <p className="font-medium text-earth-800">{phone.trim()}</p>
      </div>

      {/* Hidden fields for form submission */}
      <input type="hidden" name="phone" value={phone.trim()} />
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="storeSlug" value={storeSlug} />

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-earth-700"
        >
          密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="請輸入密碼"
          autoFocus
          className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <button
        type="submit"
        disabled={loginPending}
        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {loginPending ? "登入中..." : "登入"}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setStatusInfo(null);
          }}
          className="text-earth-500 hover:text-earth-700"
        >
          ← 換號碼
        </button>
        <Link
          href={`${prefix}/forgot-password?phone=${encodeURIComponent(phone.trim())}`}
          className="text-primary-600 hover:underline"
        >
          忘記密碼
        </Link>
      </div>
    </form>
  );
}
