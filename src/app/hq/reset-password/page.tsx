"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { completeBackofficePasswordReset } from "@/server/actions/backoffice-password-reset";

export default function BackofficeResetPasswordPage() {
  return <Suspense fallback={null}><ResetForm /></Suspense>;
}

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const store = params.get("store") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f8f5ee] px-4">
      <div className="w-full max-w-md rounded-[28px] border border-[#ded8ca] border-t-[3px] border-t-[#bd974e] bg-white p-7 shadow-xl sm:p-10">
        <SteamButlerLogo className="mx-auto mb-6 w-60 max-w-full" />
        <h1 className="text-xl font-semibold text-[#0F3B2E]">設定新的後台密碼</h1>
        {done ? <p className="mt-4 text-earth-700">密碼已更新，舊的後台登入狀態也會失效。請用新密碼登入。</p> :
        !token || !store ? <p className="mt-4 text-red-600">重設連結無效，請重新申請。</p> : (
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (password !== confirm) { setError("兩次輸入的密碼不一致"); return; }
            setError("");
            startTransition(async () => {
              const result = await completeBackofficePasswordReset(token, store, password);
              if (result.success) { setDone(true); setPassword(""); setConfirm(""); }
              else setError(result.error);
            });
          }}>
            <p className="text-sm text-earth-600">請設定 10 字元以上，包含英文字母與數字。</p>
            <label className="block text-sm font-medium" htmlFor="new-password">新密碼</label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={10}
              value={password} onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-earth-200 px-4 py-3" />
            <label className="block text-sm font-medium" htmlFor="confirm-password">再次輸入新密碼</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required minLength={10}
              value={confirm} onChange={(event) => setConfirm(event.target.value)}
              className="w-full rounded-xl border border-earth-200 px-4 py-3" />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#123E32] px-4 py-3 text-white disabled:opacity-60">
              {pending ? "處理中…" : "更新密碼"}
            </button>
          </form>
        )}
        <Link className="mt-6 block text-center text-sm text-[#123E32] underline underline-offset-4"
          href={done ? `/hq/login?store=${encodeURIComponent(store)}` : `/hq/forgot-password?store=${encodeURIComponent(store)}`}>
          {done ? "前往後台登入" : "重新申請連結"}
        </Link>
      </div>
    </main>
  );
}
