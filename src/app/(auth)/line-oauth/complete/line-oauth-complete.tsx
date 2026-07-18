"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export function LineOAuthComplete({ callbackUrl }: { callbackUrl: string }) {
  useEffect(() => { void signIn("line-taichung-coordinator", { callbackUrl }); }, [callbackUrl]);
  return <main className="mx-auto max-w-sm px-4 py-12 text-center text-sm text-earth-600">正在安全完成 LINE 登入…</main>;
}
