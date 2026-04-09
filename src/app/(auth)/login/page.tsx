"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth";
import { APP_VERSION, APP_VERSION_DATE } from "@/lib/version";

const initialState = { error: null as string | null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <div className="w-full max-w-sm rounded-xl border border-earth-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="mb-1 text-2xl font-bold text-earth-900">蒸足管理系統</h1>
      <div className="mb-6 flex items-center gap-2">
        <p className="text-sm text-earth-500">員工登入</p>
        <span className="text-[10px] text-earth-300">v{APP_VERSION} · {APP_VERSION_DATE}</span>
      </div>

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
  );
}
