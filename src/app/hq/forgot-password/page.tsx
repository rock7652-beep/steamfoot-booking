"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { requestBackofficePasswordReset } from "@/server/actions/backoffice-password-reset";

export default function BackofficeForgotPasswordPage() {
  return <Suspense fallback={null}><RecoveryForm /></Suspense>;
}

function RecoveryForm() {
  const store = useSearchParams().get("store") ?? "";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f8f5ee] px-4">
      <div className="w-full max-w-md rounded-[28px] border border-[#ded8ca] border-t-[3px] border-t-[#bd974e] bg-white p-7 shadow-xl sm:p-10">
        <SteamButlerLogo className="mx-auto mb-6 w-60 max-w-full" />
        <h1 className="text-xl font-semibold text-[#0F3B2E]">重設後台密碼</h1>
        {sent ? (
          <p className="mt-4 text-sm leading-7 text-earth-700">
            若此 Email 是該門市的有效後台帳號，重設連結會寄到原本綁定的信箱。連結一小時內有效，請檢查收件匣與垃圾郵件。
          </p>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await requestBackofficePasswordReset(email, store);
              setSent(true);
            });
          }}>
            <label className="block text-sm font-medium text-earth-700" htmlFor="recovery-email">後台登入 Email</label>
            <input id="recovery-email" type="email" autoComplete="email" required value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-earth-200 bg-[#fcfbf8] px-4 py-3" />
            <button type="submit" disabled={pending || !store}
              className="w-full rounded-xl bg-[#123E32] px-4 py-3 text-white disabled:opacity-60">
              {pending ? "送出中…" : "寄送重設連結"}
            </button>
            {!store && <p className="text-sm text-red-600">請從所屬門市的後台登入頁進入。</p>}
          </form>
        )}
        <Link className="mt-6 block text-center text-sm text-[#123E32] underline underline-offset-4"
          href={`/hq/login?store=${encodeURIComponent(store)}`}>返回後台登入</Link>
      </div>
    </main>
  );
}
