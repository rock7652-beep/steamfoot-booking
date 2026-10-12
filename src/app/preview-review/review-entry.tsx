"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export function CustomerReviewEntry() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("免密碼，僅限測試店。");
  async function enterReview() {
    if (pending) return;
    // Fragment never reaches access logs/referrers. Erase it before any request.
    const token = new URLSearchParams(window.location.hash.slice(1)).get("access");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      setMessage("請從完整暫時連結重新開啟。");
      return;
    }
    setPending(true);
    try {
        const result = await signIn("customer-review", { token, redirect: false, redirectTo: "/s/staging/admin/dashboard/bookings" });
        if (!result || result.error) { setMessage("暫時連結已失效，請取得新的驗收連結。"); return; }
        // Fixed destination: do not navigate to caller-controlled return URLs.
        window.location.replace("/s/staging/admin/dashboard/bookings");
    } catch { setMessage("暫時無法開啟，請從原連結再試一次。"); }
    finally { setPending(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-earth-50 p-5">
    <div className="max-w-md rounded-xl border border-earth-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-primary-900">#1310 測試後台</h1>
      <p role="status" className="mt-2 text-base text-earth-700">{message}</p>
      <button type="button" disabled={pending} onClick={() => void enterReview()} className="mt-4 min-h-11 rounded-lg bg-primary-700 px-4 text-base text-white disabled:opacity-50">{pending ? "開啟中…" : "進入測試店"}</button>
    </div>
  </main>;
}
