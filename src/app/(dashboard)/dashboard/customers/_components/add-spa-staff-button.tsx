"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSpaPersonFromMember } from "@/server/actions/spa-person";

export function AddSpaStaffButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div>
    <button type="button" disabled={pending || !!message} onClick={() => { setError(""); startTransition(async () => { const result = await createSpaPersonFromMember({ customerId, requestKey: crypto.randomUUID() }); if (!result.success) return setError(result.error); setMessage("已加入服務人員，可從 LINE 會員入口查看自己的工作。"); router.refresh(); }); }} className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800 disabled:opacity-60">{pending ? "加入中…" : message ? "已加入服務人員" : "加入服務人員"}</button>
    {message && <p role="status" className="mt-2 text-sm text-teal-700">{message}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
