"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { completeTaichungLineLogin } from "@/lib/line-oauth/taichung-completion-client";

export function LineOAuthComplete({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function complete() {
      const result = await completeTaichungLineLogin({
        callbackUrl,
        signIn,
        complete: async () => {
          const response = await fetch("/api/line-oauth/taichung/complete", {
            method: "POST",
            cache: "no-store",
          });
          return { ok: response.ok };
        },
        redirect: (url) => window.location.assign(url),
      });
      if (!result.ok) {
        setError("無法完成 LINE 登入，請重新從暖沐 LINE 登入後再試。");
      }
    }
    void complete();
  }, [callbackUrl]);
  if (error) {
    return <main className="mx-auto max-w-sm px-4 py-12 text-center"><p className="text-sm text-red-700">{error}</p><a className="mt-4 inline-block rounded-md bg-[#06C755] px-4 py-2 text-sm font-medium text-white" href="/api/line-oauth/taichung/start">重新登入</a></main>;
  }
  return <main className="mx-auto max-w-sm px-4 py-12 text-center text-sm text-earth-600">正在安全完成 LINE 登入…</main>;
}
