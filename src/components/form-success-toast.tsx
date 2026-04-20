"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 讀取 URL `?saved=...` 參數並以 success toast 顯示。
 * 顯示後自動清除該參數，避免 F5 / 返回時重複彈。
 *
 * 與 FormErrorToast 成對使用：
 *   - FormErrorToast → `?error=...`
 *   - FormSuccessToast → `?saved=...`
 */
export function FormSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const saved = searchParams.get("saved");

  useEffect(() => {
    if (saved) {
      toast.success(saved);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("saved");
      const remaining = params.toString();
      const newUrl = remaining
        ? `${window.location.pathname}?${remaining}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [saved, searchParams, router]);

  return null;
}
