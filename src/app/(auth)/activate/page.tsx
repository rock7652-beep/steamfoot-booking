"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  checkPhoneStatus,
  requestActivation,
} from "@/server/actions/account";

export default function ActivatePage() {
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get("phone") ?? "";

  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"form" | "sent">("form");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [verified, setVerified] = useState(!!initialPhone);
  const [pending, startTransition] = useTransition();

  function handleVerifyPhone() {
    const trimmed = phone.trim();
    if (!/^09\d{8}$/.test(trimmed)) {
      setError("手機號碼格式不正確（09 開頭共 10 碼）");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await checkPhoneStatus(trimmed);
      if (result.status === "needs_activation") {
        setCustomerName(result.customerName);
        setVerified(true);
      } else if (result.status === "active") {
        setError("此帳號已開通，請直接登入");
      } else {
        setError("找不到此手機號碼的顧客資料");
      }
    });
  }

  function handleRequestActivation() {
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("請輸入正確的 Email");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await requestActivation(trimmedPhone, trimmedEmail);
      if (result.success) {
        setMaskedEmail(result.data.masked);
        setStep("sent");
      } else {
        setError(result.error);
      }
    });
  }

  if (step === "sent") {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-earth-900">驗證信已寄出</h2>
          <p className="mt-2 text-sm text-earth-600">
            開通連結已寄至 <span className="font-medium">{maskedEmail}</span>
          </p>
          <p className="mt-1 text-xs text-earth-400">
            請於 24 小時內點擊信中連結完成密碼設定
          </p>

          <div className="mt-6 space-y-2">
            <button
              onClick={() => setStep("form")}
              className="w-full rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50"
            >
              重新寄送
            </button>
            <Link
              href="/"
              className="block w-full text-center text-sm text-primary-600 hover:underline"
            >
              返回登入
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-earth-900">帳號開通</h1>
        <p className="mt-1 text-sm text-earth-500">
          設定密碼以啟用您的會員帳號
        </p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <p>{error}</p>
            {error.includes("已開通") && (
              <Link href="/" className="mt-1 inline-block font-medium text-primary-600 hover:underline">
                返回登入 →
              </Link>
            )}
          </div>
        )}

        {!verified ? (
          /* ── Step 1: 輸入手機 ── */
          <div className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-earth-700">
                手機號碼
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleVerifyPhone(); } }}
                placeholder="0912345678"
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              type="button"
              onClick={handleVerifyPhone}
              disabled={pending}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "確認中..." : "確認手機號碼"}
            </button>
          </div>
        ) : (
          /* ── Step 2: 輸入 Email ── */
          <div className="space-y-4">
            {customerName && (
              <div className="rounded-lg bg-earth-50 px-3 py-2">
                <p className="text-xs text-earth-500">歡迎</p>
                <p className="font-medium text-earth-800">{customerName}</p>
              </div>
            )}

            <p className="text-sm text-earth-600">
              請輸入您的 Email，我們將寄送帳號開通連結給您。
            </p>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-earth-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRequestActivation(); } }}
                placeholder="your@email.com"
                autoFocus
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <button
              type="button"
              onClick={handleRequestActivation}
              disabled={pending}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pending ? "寄送中..." : "寄送開通連結"}
            </button>
          </div>
        )}

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-earth-500 hover:text-earth-700">
            ← 返回登入
          </Link>
        </div>
      </div>
    </div>
  );
}
