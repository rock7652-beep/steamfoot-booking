"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 讀取 URL ?error=... 參數並以 toast 顯示錯誤訊息
 * 顯示後自動清除 URL 中的 error 參數
 */
export function FormErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");

  useEffect(() => {
    if (error) {
      toast.error(error);
      // 清除 URL 中的 error 參數
      const params = new URLSearchParams(searchParams.toString());
      params.delete("error");
      const remaining = params.toString();
      const newUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [error, searchParams, router]);

  return null;
}
