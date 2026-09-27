// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/actions/plan", () => ({ updatePlan: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { PlanActiveToggle } from "@/app/(dashboard)/dashboard/plans/plan-active-toggle";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); vi.clearAllMocks(); });
it("shows the proposed state before saving and restores rejected changes", async () => {
  let resolve!: (result: {success:boolean;error?:string}) => void;
  mocks.update.mockImplementation(() => new Promise(r => { resolve = r; }));
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  act(() => root.render(createElement(PlanActiveToggle, {planId:"p",planName:"方案",isActive:true})));
  act(() => container.querySelector("button")!.click());
  expect(container.textContent).toContain("已下架・儲存中");
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => { resolve({success:false,error:"拒絕修改"}); });
  expect(container.textContent).toContain("上架中");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("拒絕修改");
});
it("retains the saved value while the route refresh is still pending", async () => {
  mocks.update.mockResolvedValue({success:true});
  const container = document.createElement("div"); const root = createRoot(container); roots.push(root);
  act(() => root.render(createElement(PlanActiveToggle, {planId:"p",planName:"方案",isActive:true})));
  await act(async () => { container.querySelector("button")!.click(); });
  expect(container.querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
