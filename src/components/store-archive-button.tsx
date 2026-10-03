"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStoreArchivedAction } from "@/server/actions/store-archive";

export function StoreArchiveButton({ storeId, name, archived }: { storeId: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div>
    <button type="button" disabled={pending} className="min-h-11 px-2 text-sm text-earth-600 hover:text-primary-600 disabled:opacity-50" onClick={() => {
      if (!archived && !window.confirm(`封存「${name}」？將從預設清單與切店選單隱藏，資料與營運權限保留，可隨時還原。`)) return;
      setError("");
      startTransition(async () => {
        try {
          const result = await setStoreArchivedAction(storeId, !archived);
          if (!result.success) setError(result.error ?? "儲存失敗，請重試");
          else router.refresh();
        } catch { setError("儲存失敗，請重試"); }
      });
    }}>{pending ? "儲存中…" : archived ? "還原" : "封存"}</button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
