"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

function categorizeError(error: Error & { digest?: string }): {
  title: string;
  description: string;
} {
  const msg = error.message || "";

  if (msg.includes("UNAUTHORIZED") || msg.includes("請先登入")) {
    return { title: "登入已過期", description: "請重新登入後再試。" };
  }
  if (msg.includes("FORBIDDEN") || msg.includes("權限") || msg.includes("無權")) {
    return { title: "權限不足", description: "您沒有存取此頁面的權限，請聯繫管理員。" };
  }
  if (msg.includes("NOT_FOUND") || msg.includes("不存在")) {
    return { title: "資料不存在", description: "找不到請求的資料，可能已被刪除或從未建立。" };
  }
  if (msg.includes("Null constraint") || msg.includes("storeId")) {
    return { title: "系統設定不完整", description: "店舖資料或系統設定可能尚未初始化，請聯繫管理員檢查資料庫。" };
  }
  if (msg.includes("Foreign key") || msg.includes("foreign key")) {
    return { title: "資料關聯錯誤", description: "相關資料不存在或已被刪除，請聯繫管理員檢查。" };
  }
  if (msg.includes("NEXT_PUBLIC_") || msg.includes("env")) {
    return { title: "環境設定缺失", description: "部分環境變數尚未設定，請聯繫管理員補齊。" };
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED")) {
    return { title: "外部服務異常", description: "無法連線至第三方服務，請稍後再試。" };
  }

  return { title: "發生錯誤", description: "操作過程中發生未預期的錯誤，請重試。" };
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const { title, description } = categorizeError(error);

  return (
    <ErrorState
      title={title}
      description={description}
      retry={reset}
      backHref="/dashboard"
    />
  );
}
