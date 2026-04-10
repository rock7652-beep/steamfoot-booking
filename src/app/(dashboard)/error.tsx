"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="發生錯誤"
      description="操作過程中發生未預期的錯誤，請重試。"
      retry={reset}
      backHref="/dashboard"
    />
  );
}
