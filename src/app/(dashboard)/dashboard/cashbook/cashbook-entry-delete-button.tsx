"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCashbookEntry } from "@/server/actions/cashbook";

interface CashbookEntryDeleteButtonProps {
  entryId: string;
}

export function CashbookEntryDeleteButton({ entryId }: CashbookEntryDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    const confirmed = window.confirm("確定要刪除這筆現金帳紀錄嗎？刪除後無法復原。");
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await deleteCashbookEntry(entryId);

        if (!result.success) {
          toast.error(result.error ?? "刪除失敗");
          return;
        }

        toast.success("已刪除現金帳紀錄");
        router.refresh();
      } catch {
        toast.error("刪除失敗，請稍後再試");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-red-600 hover:underline disabled:cursor-wait disabled:text-earth-400"
    >
      {isPending ? "刪除中..." : "刪除"}
    </button>
  );
}
