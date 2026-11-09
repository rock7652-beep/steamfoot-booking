import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/server/actions/store-member-connection", () => ({ loadMemberConnectionAction: vi.fn(), approveMemberConnectionAction: vi.fn(), approveLoginRecoveryAction: vi.fn() }));
vi.mock("@/components/admin/settings-panel-context", () => ({ useSettingsPanelGuard: vi.fn() }));
vi.mock("@/components/operations/panel-read-cache", () => ({ usePanelReader: () => ({ read: vi.fn(), invalidate: vi.fn() }) }));
vi.mock("@/lib/customer-support-read-client", () => ({ readMemberConnection: vi.fn() }));
import { StoreMemberConnectionPanel } from "@/components/admin/store-member-connection-panel";
const customerId = "customer-a";
const data = { membership: "已連結", login: "尚未驗證本次登入", notification: "本店通知尚未確認", pending: [] as Array<{ id: string; kind: "login" | "notification"; verificationCode: string }>, conflict: false };
function render(value: typeof data, pendingOnly: boolean) {
  return renderToStaticMarkup(React.createElement(StoreMemberConnectionPanel, { customerId, pendingOnly, initial: { customerId, value: { success: true, canConfirm: true, data: value } } }));
}
it("hides the summary when there is no action needed", () => {
  expect(render(data, true)).toBe("");
  expect(render(data, false)).toContain("本店會員與 LINE");
});
it("retains a pending login recovery action without the summary", () => {
  const html = render({ ...data, pending: [{ id: "r", kind: "login", verificationCode: "ABC123" }] }, true);
  expect(html).toContain("會員登入待確認");
  expect(html).toContain("允許重新登入");
  expect(html).not.toContain("會員資料：");
});
it("retains the warning when identities conflict", () => {
  expect(render({ ...data, conflict: true }, true)).toContain("有多筆待確認身分");
});
