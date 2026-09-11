import type { ReactNode } from "react";

/** Visible feedback shared by route fallbacks and asynchronous read panels. */
export function LoadingStatus({ children = "讀取中，請稍候…" }: { children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-2 text-sm font-medium text-earth-700">
      <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-earth-200 border-t-primary-600 motion-reduce:animate-none" />
      <span>{children}</span>
    </div>
  );
}
