"use client";

import { useLinkStatus } from "next/link";

/**
 * LinkPendingLabel — 放在 `<Link>`（或 `DashboardLink`）內當 children，
 * 在導航進行中即時顯示 spinner，讓使用者點擊後立刻有反應、不會以為卡住。
 *
 * 用法：
 *   <Link href="...">
 *     <LinkPendingLabel>＋ 新增預約</LinkPendingLabel>
 *   </Link>
 *
 * `useLinkStatus` 讀取最近一層 `<Link>` 的 pending 狀態（Next 16）；
 * 因此本元件必須是某個 `<Link>` 的子孫節點。
 */
export function LinkPendingLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      <span className={pending ? "opacity-70" : undefined}>{children}</span>
    </span>
  );
}
