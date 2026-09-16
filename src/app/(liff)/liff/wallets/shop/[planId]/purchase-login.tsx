"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export function PurchaseLogin({ callbackUrl }: { callbackUrl: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div className="rounded-xl border border-earth-200 bg-white p-4 text-center">
    <p className="mb-3 text-sm text-earth-600">請先登入確認購買人身分，再進行轉帳。</p>
    <button type="button" disabled={pending} onClick={async () => { setPending(true); setError(false); try { await signIn("line", { callbackUrl }); } catch { setError(true); setPending(false); } }} className="w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? "登入中…" : "使用 LINE 登入後繼續"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">登入未完成，請再試一次。</p>}
  </div>;
}
