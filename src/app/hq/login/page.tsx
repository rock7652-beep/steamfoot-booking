"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { hqLoginAction } from "@/server/actions/auth";
import { APP_VERSION, APP_VERSION_DATE } from "@/lib/version";

const initialState = { error: null as string | null };

const URL_ERROR_MESSAGES: Record<string, string> = {
  "missing-store": "您的登入資訊缺少店舖資料，請重新登入。",
  "admin-required": "此區域僅限系統管理者使用。",
  "store-mismatch": "您的帳號與該店舖不符，請從正確入口登入。",
};

export default function HqLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-earth-50"><p className="text-earth-400">載入中...</p></div>}>
      <HqLoginForm />
    </Suspense>
  );
}

function HqLoginForm() {
  const [state, action, pending] = useActionState(hqLoginAction, initialState);
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const urlErrorMessage = urlError ? URL_ERROR_MESSAGES[urlError] : null;
  const storeSlug = searchParams.get("store");

  return (
    <div className="flex min-h-screen items-center justify-center bg-earth-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-2xl font-bold text-earth-900">蒸足管理系統</h1>
        <div className="mb-6 flex items-center gap-2">
          <p className="text-sm text-earth-500">後台登入</p>
          <span className="text-[10px] text-earth-300">v{APP_VERSION} · {APP_VERSION_DATE}</span>
        </div>

        {urlErrorMessage && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {urlErrorMessage}
          </p>
        )}

        <form action={action} className="space-y-4">
          {/* 保留 store context，讓 OWNER/STAFF 登入後導向該店後台 */}
          {storeSlug && <input type="hidden" name="storeSlug" value={storeSlug} />}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-earth-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="alice@steamfoot.tw"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-earth-700">
              密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "登入中…" : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
