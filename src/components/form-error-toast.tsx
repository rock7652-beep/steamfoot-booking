"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 讀取 URL ?error=... 參數並以 toast 顯示錯誤訊息
 * 顯示後自動清除 URL 中的 error 參數
 *
 * PR-8：同步支援 ?cashDrawerError=... 命名，給現金管理一頁式工作台
 *   (/dashboard/cashbook) 使用，避免與既有 cashbook filter 等任何 ?error= 衝突。
 *   兩個 param 行為相同（顯示 toast 後從 URL 刪除）。
 */
const ERROR_PARAM_NAMES = ["error", "cashDrawerError"] as const;

export function FormErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // 任何 ERROR_PARAM_NAMES 中第一個有值的 param 都會被顯示
  const error =
    ERROR_PARAM_NAMES.map((name) => searchParams.get(name)).find((v) => v) ?? null;

  useEffect(() => {
    if (error) {
      toast.error(error);
      // 顯示後一次清掉所有可能的 error 命名，避免 reload 重彈
      const params = new URLSearchParams(searchParams.toString());
      for (const name of ERROR_PARAM_NAMES) params.delete(name);
      const remaining = params.toString();
      const newUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [error, searchParams, router]);

  return null;
}
