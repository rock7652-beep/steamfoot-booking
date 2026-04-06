"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { requestPasswordReset } from "@/server/actions/account";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get("phone") ?? "";

  const [phone, setPhone] = useState(initialPhone);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const trimmed = phone.trim();
    if (!/^09\d{8}$/.test(trimmed)) {
      setError("請輸入正確的手機號碼（09 開頭共 10 碼）");
      return;
    }
    setError(null);

    startTransition(async () => {
      await requestPasswordReset(trimmed);
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-earth-900">重設連結已寄出</h2>
          <p className="mt-2 text-sm text-earth-600">
            若此手機號碼已綁定 Email，重設密碼連結已寄出，請於 1 小時內完成。
          </p>
          <p className="mt-2 text-xs text-earth-400">
            若未收到信件，請確認 Email 是否正確，或聯繫店家協助。
          </p>

          <div className="mt-6 space-y-2">
            <button
              onClick={() => setSent(false)}
              className="w-full rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50"
            >
              重新送出
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
        <h1 className="text-xl font-bold text-earth-900">忘記密碼</h1>
        <p className="mt-1 text-sm text-earth-500">
          輸入手機號碼，我們將寄送重設連結至您的 Email
        </p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

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
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              placeholder="0912345678"
              autoFocus
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "送出中..." : "送出重設連結"}
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-earth-500 hover:text-earth-700">
            ← 返回登入
          </Link>
        </div>
      </div>
    </div>
  );
}
