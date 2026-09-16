"use client";

import { SteamButlerLogo } from "@/components/steam-butler-logo";


import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { hqLoginAction } from "@/server/actions/auth";

const initialState = { error: null as string | null };

const URL_ERROR_MESSAGES: Record<string, string> = {
  "missing-store": "您的登入資訊缺少店舖資料，請重新登入。",
  "admin-required": "此區域僅限系統管理者使用。",
  "store-mismatch": "您的帳號與該店舖不符，請從正確入口登入。",
  "wrong-entry": "請從對應身份的登入入口進入。",
};

export default function HqLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top_left,#e7eee7_0%,#f8f5ee_55%,#f3ebdd_100%)]"><p className="text-earth-400">載入中...</p></div>}>
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
    <div className="flex min-h-dvh items-start justify-center bg-[radial-gradient(ellipse_at_top_left,#e7eee7_0%,#f8f5ee_55%,#f3ebdd_100%)] px-4 pb-8 pt-8 sm:items-center sm:py-8">
      <div className="w-full max-w-md rounded-[28px] border border-[#ded8ca] border-t-[3px] border-t-[#bd974e] bg-white p-7 shadow-[0_20px_70px_-30px_rgba(15,59,46,0.22)] sm:p-10">
        <div className="mb-7 border-b border-[#e9e3d7] pb-6 text-center">
          <SteamButlerLogo className="mx-auto mb-6 w-60 max-w-full" />
          <h1 className="text-2xl font-semibold text-[#0F3B2E]">後台登入</h1>
          <p className="mt-1 text-sm text-earth-500">登入管理您的店務</p>
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
              className="mt-1 block w-full rounded-xl border border-earth-200 bg-[#fcfbf8] px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="請輸入登入 Email"
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
              className="mt-1 block w-full rounded-xl border border-earth-200 bg-[#fcfbf8] px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            className="w-full rounded-xl bg-[#123E32] px-4 py-3 text-base font-medium text-white hover:bg-[#245A49] disabled:opacity-60"
          >
            {pending ? "登入中…" : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
