"use client";
import { publishMusicFinanceChange, isMusicPreviewPage } from "@/lib/music-finance-sync";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCashbookEntry } from "@/server/actions/cashbook";

interface CashbookEntryDeleteButtonProps {
  entryId: string;
}

export function CashbookEntryDeleteButton({ entryId }: CashbookEntryDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  function handleDelete(accepted = false) {
    if (!accepted && isMusicPreviewPage()) { setConfirming(true); return; }
    const confirmed = accepted || window.confirm("確定要刪除這筆現金帳紀錄嗎？刪除後無法復原。");
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await deleteCashbookEntry(entryId);

        if (!result.success) {
          toast.error(result.error ?? "刪除失敗");
          return;
        }

        setConfirming(false);
        toast.success("已刪除現金帳紀錄");
        publishMusicFinanceChange();
        router.refresh();
      } catch {
        toast.error("刪除失敗，請稍後再試");
      }
    });
  }

  return (
    <><button
      type="button"
      onClick={() => handleDelete()}
      disabled={isPending}
      className="text-red-600 hover:underline disabled:cursor-wait disabled:text-earth-400"
    >
      {isPending ? "刪除中..." : "刪除"}
    </button>{confirming && <span role="alertdialog" aria-label="確認刪除收支" className="inline-flex flex-wrap items-center gap-2 p-2">
      <span>刪除這筆紀錄？無法復原。</span>
      <button type="button" disabled={isPending} onClick={()=>handleDelete(true)} className="min-h-11 px-3 text-red-700">確認刪除</button>
      <button type="button" disabled={isPending} onClick={()=>setConfirming(false)} className="min-h-11 px-3">取消</button>
    </span>}</>
  );
}
