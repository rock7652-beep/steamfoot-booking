import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard sidebar navigation", () => {
  const source = readFileSync("src/components/sidebar.tsx", "utf8");
  const todoSource = readFileSync(
    "src/app/(dashboard)/dashboard/store-todo-list.tsx",
    "utf8",
  );

  it("uses full-page navigation for expanded and collapsed sidebar items", () => {
    expect(source.match(/<a\s+href=\{`\$\{dashboardPrefix\}\$\{item\.href\}`\}/g)).toHaveLength(2);
    expect(source).not.toContain("useLinkStatus");
    expect(source).not.toContain("NavItemPending");
  });

  it("keeps pending-payment notices on the homepage with an explicit close action", () => {
    expect(source).not.toContain('label: "待確認付款"');
    expect(source).not.toContain("pendingPaymentCount");
    expect(todoSource).toContain('pending ? "關閉中…" : "關閉提示"');
    expect(todoSource).toContain("只從我的首頁關閉，不會變更交易或顧客狀態");
    expect(todoSource).toContain("dismissTodoFormAction");
  });
});
