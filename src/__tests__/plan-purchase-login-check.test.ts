// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ load: vi.fn(), approve: vi.fn() }));
vi.mock("@/server/actions/store-member-connection", () => ({
  loadMemberConnectionAction: m.load, approveLoginRecoveryAction: m.approve, approveMemberConnectionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams() }));
import { PlanPurchaseLoginCheck } from "@/components/admin/plan-purchase-login-check";
let host: HTMLDivElement, root: Root;
const status = (state: string, pending: unknown[] = [], canConfirm = true) => ({ success: true, canConfirm, data: {
  membership: "尚未連結", notification: "本店已確認，發送前再檢查通道", login: "尚未驗證本次登入",
  purchaseLoginState: state, pending, conflict: false,
} });
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const button = (text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text)!;
it("keeps the saved plan visible while a new guest submits a request, then uses the existing approval and rechecks the Login link", async () => {
  m.load.mockResolvedValue(status("start")); m.approve.mockResolvedValue({ success: true }); const done = vi.fn();
  await act(async () => root.render(React.createElement(PlanPurchaseLoginCheck, { customerId: "guest", onDone: done })));
  expect(host.textContent).toContain("開卡完成，方案已儲存"); expect(host.textContent).toContain("會員登入待確認");
  expect(host.textContent).toContain("送出申請"); expect(m.approve).not.toHaveBeenCalled();
  m.load.mockResolvedValue(status("review", [{ id: "request", kind: "login", verificationCode: "ABC123" }]));
  await act(async () => button("重新檢查").click());
  await act(async () => button("已核對本人與確認碼，允許重新登入").click());
  expect(m.approve).toHaveBeenCalledWith("request", "guest", "ABC123");
  expect(host.textContent).toContain("已核准，請顧客登入"); expect(done).not.toHaveBeenCalled();
  m.load.mockResolvedValue(status("ready")); await act(async () => button("重新檢查").click());
  expect(host.textContent).toContain("會員登入連結已就緒");
  expect(host.textContent).toContain("確認能看到本次方案"); expect(host.textContent).not.toContain("已登入成功");
  await act(async () => button("完成").click()); expect(done).toHaveBeenCalledOnce();
});
it("never offers approval to read-only staff and does not confuse notification approval with Login", async () => {
  m.load.mockResolvedValue(status("start", [{ id: "oa", kind: "notification", verificationCode: "OA0000" }], false));
  await act(async () => root.render(React.createElement(PlanPurchaseLoginCheck, { customerId: "guest", onDone: vi.fn() })));
  expect(host.textContent).not.toContain("OA0000"); expect(host.textContent).toContain("請有顧客修改權限的人員");
  expect(m.approve).not.toHaveBeenCalled();
});
it("keeps successful checkout distinct from a failed identity read, and allows retry", async () => {
  m.load.mockResolvedValue({ success: false, error: "讀取失敗" });
  await act(async () => root.render(React.createElement(PlanPurchaseLoginCheck, { customerId: "guest", onDone: vi.fn() })));
  expect(host.textContent).toContain("開卡完成，方案已儲存"); expect(host.textContent).toContain("讀取失敗");
  m.load.mockResolvedValue(status("start")); await act(async () => button("重新檢查").click());
  expect(host.textContent).not.toContain("讀取失敗"); expect(host.textContent).toContain("送出申請");
});
