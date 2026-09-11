"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { DashboardLink } from "./dashboard-link";

function NavigationLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite" aria-busy={pending} onClick={(event) => {
    if (pending && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) event.preventDefault();
  }}>{pending ? "開啟中…" : children}</span>;
}

// 僅在顧客詳情／編輯入口有操作意圖時預載完整頁面。
// 使用 Next Router Cache，沿用 server action revalidatePath 的失效機制。
export function CustomerPageLink({ children, onMouseEnter, onFocus, ...props }: ComponentProps<typeof DashboardLink>) {
  const [intent, setIntent] = useState(false);
  const isCustomerPage = /^\/dashboard\/customers\/[^/?#]+(?:\/edit)?$/.test(props.href);
  if (!isCustomerPage) return <DashboardLink {...props} onMouseEnter={onMouseEnter} onFocus={onFocus}>{children}</DashboardLink>;
  return (
    <DashboardLink {...props} prefetch={intent ? true : null}
      onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
      onFocus={(event) => { setIntent(true); onFocus?.(event); }}>
      <NavigationLabel>{children}</NavigationLabel>
    </DashboardLink>
  );
}
