"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchViewedStore } from "@/server/actions/store-view-mode";
import { OWN_STORE_VALUE } from "@/lib/store-view-mode-constants";
import { toast } from "sonner";

interface ViewModeBannerProps {
  viewedStoreName: string;
}

export function ViewModeBanner({ viewedStoreName }: ViewModeBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function returnToOwnStore() {
    startTransition(async () => {
      const result = await switchViewedStore(OWN_STORE_VALUE);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error ?? "返回母店失敗");
        router.refresh();
      }
    });
  }

  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">展店管理模式</div>
          <div className="mt-1 leading-6">
            目前查看：<span className="font-semibold">{viewedStoreName}</span>
            <br />
            您可在授權範圍內查看與管理此店資料。
          </div>
        </div>
        <button
          type="button"
          onClick={returnToOwnStore}
          disabled={isPending}
          className="shrink-0 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "返回中..." : "返回我的店"}
        </button>
      </div>
    </div>
  );
}
