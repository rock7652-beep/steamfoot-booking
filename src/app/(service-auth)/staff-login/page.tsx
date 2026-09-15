"use client";

import { useActionState, useState } from "react";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { serviceStaffLoginAction } from "@/server/actions/auth";

const initialState = { error: null as string | null };

export default function ServiceStaffLoginPage() {
  const [state, action, pending] = useActionState(serviceStaffLoginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top_left,#e7eee7_0%,#f8f5ee_55%,#f3ebdd_100%)] px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-[#ded8ca] border-t-[3px] border-t-[#bd974e] bg-white p-7 shadow-[0_20px_70px_-30px_rgba(15,59,46,0.22)] sm:p-10">
        <SteamButlerLogo className="mx-auto mb-6 w-60 max-w-full" />
        <h1 className="mt-1 text-2xl font-semibold text-[#0F3B2E]">服務人員登入</h1>
        <p className="mt-2 text-sm text-earth-500">查看自己的今日工作與未來預約</p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="storeSlug" value="demo" />
          <label className="block text-sm font-medium text-earth-700">
            手機號碼
            <input name="phone" type="tel" inputMode="numeric" autoComplete="tel" pattern="09[0-9]{8}" maxLength={10} required placeholder="09xxxxxxxx" className="mt-1 block w-full rounded-xl border border-earth-300 px-3 py-3 text-base outline-none focus:border-primary-500" />
          </label>
          <label className="block text-sm font-medium text-earth-700">
            密碼
            <span className="mt-1 flex rounded-xl border border-earth-300 bg-white focus-within:border-primary-500">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={6} required className="min-w-0 flex-1 rounded-xl px-3 py-3 text-base outline-none" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="px-3 text-sm text-earth-600">
                {showPassword ? "隱藏" : "顯示"}
              </button>
            </span>
          </label>
          {state.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary-600 px-4 py-3 font-medium text-white disabled:opacity-60">
            {pending ? "登入中…" : "登入我的預約"}
          </button>
        </form>
      </section>
    </main>
  );
}
