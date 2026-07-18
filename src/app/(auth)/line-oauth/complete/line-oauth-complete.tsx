"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export function LineOAuthComplete({ callbackUrl }: { callbackUrl: string }) {
  useEffect(() => {
    async function complete() {
      const result = await signIn("line-taichung-coordinator", {
        redirect: false,
        callbackUrl,
      });
      if (!result?.ok) {
        window.location.assign("/s/taichung/?error=LineLoginFailed");
        return;
      }
      // The Auth.js JWT now exists. Clear the one-time bridge on the server
      // before the customer is sent to the fixed Taiwan destination.
      await fetch("/api/line-oauth/taichung/complete", { method: "POST" });
      window.location.assign("/s/taichung/book");
    }
    void complete();
  }, [callbackUrl]);
  return <main className="mx-auto max-w-sm px-4 py-12 text-center text-sm text-earth-600">正在安全完成 LINE 登入…</main>;
}
