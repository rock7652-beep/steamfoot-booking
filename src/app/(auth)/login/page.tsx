"use client";

import { SteamButlerLogo } from "@/components/steam-butler-logo";


import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/server/actions/auth";

const initialState = { error: null as string | null };

const URL_ERROR_MESSAGES: Record<string, string> = {
  "missing-store": "您的登入資訊缺少店舖資料，請重新登入。",
};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const urlErrorMessage = urlError ? URL_ERROR_MESSAGES[urlError] : null;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-earth-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6">
          <SteamButlerLogo className="mb-4 w-40" />
          <h1 className="text-xl font-semibold text-[#0F3B2E]">後台登入</h1>
          <p className="mt-1 text-sm text-earth-500">登入管理您的店務</p>
        </div>

      {urlErrorMessage && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {urlErrorMessage}
        </p>
      )}

      <form action={action} className="space-y-4">
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
            className="mt-1 block w-full rounded-lg border border-earth-200 px-3 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            className="mt-1 block w-full rounded-lg border border-earth-200 px-3 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
          className="w-full rounded-lg bg-primary-600 px-4 py-3 text-base font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
