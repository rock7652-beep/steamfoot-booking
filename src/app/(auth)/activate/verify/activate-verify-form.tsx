"use client";

import { useState, useTransition, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  activateAccount,
  autoLoginAfterActivation,
} from "@/server/actions/account";

const BUILD_TAG = "v20260406-de7be7d-B";

export default function ActivateVerifyForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);

  // 確認 hydration 完成
  useEffect(() => {
    setHydrated(true);
    console.log(`[Activate UI] hydrated! build=${BUILD_TAG} host=${window.location.host} token=${token ? token.slice(0, 8) + "..." : "EMPTY"}`);
  }, [token]);

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm text-center">
          <p className="text-sm text-red-600">無效的連結，請重新申請帳號開通。</p>
          <Link href="/activate" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            重新開通 →
          </Link>
        </div>
      </div>
    );
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    console.log("[Activate UI] form onSubmit fired");

    setError(null);

    if (!/^\d{4,}$/.test(password)) {
      console.log("[Activate UI] blocked: password not numeric");
      setError("密碼需為純數字，至少 4 碼");
      return;
    }
    if (password !== confirmPassword) {
      console.log("[Activate UI] blocked: password mismatch");
      setError("兩次密碼不一致");
      return;
    }

    console.log("[Activate UI] calling activateAccount...");
    startTransition(async () => {
      try {
        const result = await activateAccount(token, password);
        console.log("[Activate UI] returned:", JSON.stringify(result));
        if (!result.success) {
          setError(result.error);
          return;
        }

        setSuccess(true);

        try {
          await autoLoginAfterActivation(result.data.phone, password);
        } catch {
          // redirect error from signIn — expected
        }
      } catch (err) {
        console.error("[Activate UI] threw:", err);
        setError("系統錯誤，請稍後再試");
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
          <h2 className="text-lg font-bold text-earth-900">帳號開通成功！</h2>
          <p className="mt-2 text-sm text-earth-600">正在為您自動登入...</p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary-600 hover:underline">
            手動登入 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-earth-900">設定密碼</h1>
        <p className="mt-1 text-sm text-earth-500">
          完成密碼設定即可登入使用
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <p>{error}</p>
            {(error.includes("過期") || error.includes("無效")) && (
              <Link href="/activate" className="mt-1 inline-block font-medium text-primary-600 hover:underline">
                重新申請 →
              </Link>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-earth-700">
              設定密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              inputMode="numeric"
              pattern="\d{4,}"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 4 位數字"
              required
              autoFocus
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-earth-700">
              確認密碼
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              inputMode="numeric"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次輸入密碼"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "開通中..." : "完成開通"}
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-earth-500 hover:text-earth-700">
            ← 返回登入
          </Link>
        </div>
        {/* 版本標記 + hydration 狀態 */}
        <p className="mt-2 text-center text-[10px] text-earth-300">
          {BUILD_TAG} {hydrated ? "✓ JS ready" : "⏳ loading..."}
        </p>
      </form>
    </div>
  );
}
