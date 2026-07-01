"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { OWN_STORE_VALUE, switchViewedStore } from "@/server/actions/store-view-mode";

interface ViewModeBannerProps {
  viewedStoreName: string;
}

export function ViewModeBanner({ viewedStoreName }: ViewModeBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function returnToOwnStore() {
    startTransition(async () => {
      const result = await switchViewedStore(OWN_STORE_VALUE);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">👁 查看模式</div>
          <div className="mt-1 leading-6">
            目前查看：<span className="font-semibold">{viewedStoreName}</span>
            <br />
            查看模式提供完整閱讀能力，所有營運操作請由該店自行完成。
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
