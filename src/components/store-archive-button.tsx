"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStoreArchivedAction } from "@/server/actions/store-archive";

export function StoreArchiveButton({ storeId, name, archived }: { storeId: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  return <div>
    <button type="button" disabled={pending} className="min-h-11 px-2 text-sm text-earth-600 hover:text-primary-600 disabled:opacity-50" onClick={() => {
      if (!archived && !confirming) { setConfirming(true); return; }
      setConfirming(false);
      setError("");
      startTransition(async () => {
        try {
          const result = await setStoreArchivedAction(storeId, !archived);
          if (!result.success) setError(result.error ?? "儲存失敗，請重試");
          else router.refresh();
        } catch { setError("儲存失敗，請重試"); }
      });
    }}>{pending ? "儲存中…" : archived ? "還原" : confirming ? "確認封存" : "封存"}</button>
    {confirming && <div className="max-w-72 whitespace-normal text-left text-sm text-earth-600">
      <p>封存「{name}」？隱藏清單，保留資料與權限，可隨時還原。</p>
      <button type="button" className="min-h-11 px-2" onClick={() => setConfirming(false)}>取消</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
