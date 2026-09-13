"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateStoreAction } from "@/server/actions/store-onboarding";

export function ActivateTrialButton({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <div>
    <button type="button" disabled={pending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60" onClick={() => {
      setMessage("");
      startTransition(async () => {
        try {
          const result = await activateStoreAction(storeId);
          if (!result.success) { setMessage(result.error); return; }
          router.push(`/hq/dashboard/stores/subscriptions/${storeId}`);
          router.refresh();
        } catch { setMessage("開通失敗，請稍後再試"); }
      });
    }}>{pending ? "開通中…" : "開通 30 天單店試用"}</button>
    {message && <p role="alert" className="mt-2 text-sm text-red-600">{message}</p>}
  </div>;
}
