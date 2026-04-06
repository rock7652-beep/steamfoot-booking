"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/server/actions/account";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm text-center">
          <p className="text-sm text-red-600">無效的連結，請重新申請密碼重設。</p>
          <Link href="/forgot-password" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            重新申請 →
          </Link>
        </div>
      </div>
    );
  }

  function handleSubmit() {
    setError(null);

    if (!/^\d{4,}$/.test(password)) {
      setError("密碼需為純數字，至少 4 碼");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次密碼不一致");
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(token, password);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (success) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-earth-900">密碼重設成功</h2>
          <p className="mt-2 text-sm text-earth-600">
            您的密碼已更新，請使用新密碼登入。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            前往登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-earth-900">重設密碼</h1>
        <p className="mt-1 text-sm text-earth-500">請設定新的登入密碼</p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <p>{error}</p>
            {(error.includes("過期") || error.includes("無效")) && (
              <Link href="/forgot-password" className="mt-1 inline-block font-medium text-primary-600 hover:underline">
                重新申請 →
              </Link>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-earth-700">
              新密碼
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 4 位數字"
              autoFocus
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-earth-700">
              確認新密碼
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              placeholder="再次輸入新密碼"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "重設中..." : "確認重設"}
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
