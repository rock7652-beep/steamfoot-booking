// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reorder: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/server/actions/store-organization", () => ({ reorderStoreCatalogAction: mocks.reorder, updateStoreParentAction: vi.fn(), updateOrganizationCapacityAction: vi.fn() }));
vi.mock("@/server/actions/store-archive", () => ({ setStoreArchivedAction: vi.fn() }));
import { StoreOrganizationManager } from "@/app/hq/dashboard/stores/organization/store-organization-manager";
const row = (id: string, name: string, parentStoreId: string | null = null, archivedAt: Date | null = null) => ({ id, name, slug: id, parentStoreId, archivedAt, catalogSortOrder: 0, plan: "BASIC", maxStoresOverride: null, isDemo: false, operatingStatus: "ACTIVE", createdAt: new Date("2026-01-01") });
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); window.scrollTo = vi.fn();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(canManage = true) { await act(async () => root.render(createElement(StoreOrganizationManager, { stores: [row("parent", "母店"), row("child", "運動學員店", "parent"), row("second", "第二店"), row("archived", "封存測試店", null, new Date())], userId: "admin-test", canManage }))); }
function button(label: string) { return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
describe("HQ organization catalog", () => {
  it("hides archives by default, allowing explicit inspection", async () => {
    await render(); expect(container.querySelector('[data-store-id="archived"]')).toBeNull();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(container.querySelector('[data-store-id="archived"]')?.textContent).toContain("已封存");
    expect(button("封存測試店 上移")).toBeNull();
  });
  it("search retains ancestors and disables sorting", async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="搜尋店舖"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "運動"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.querySelector('[data-store-id="parent"]')).not.toBeNull();
    expect(container.querySelector('[data-store-id="child"]')).not.toBeNull();
    expect(container.querySelector('[data-store-id="second"]')).toBeNull();
    expect(button("母店 上移")).toBeNull();
  });
  it("collapses branches without hiding the parent", async () => {
    await render(); await act(async () => button("母店 收合").click());
    expect(container.querySelector('[data-store-id="child"]')).toBeNull();
    expect(container.querySelector('[data-store-id="parent"]')).not.toBeNull();
  });
  it("rolls back failed sibling sorting", async () => {
    mocks.reorder.mockResolvedValue({ success: false, error: "儲存失敗" }); await render();
    await act(async () => button("第二店 上移").click());
    expect(mocks.reorder).toHaveBeenCalledWith({ parentStoreId: null, expectedIds: ["parent", "second"], orderedIds: ["second", "parent"] });
    expect([...container.querySelectorAll('[data-store-id]')].map(node => node.getAttribute("data-store-id"))).toEqual(["parent", "child", "second"]);
    expect(container.textContent).toContain("儲存失敗");
  });
  it("allows readonly inspection without mutation controls", async () => {
    await render(false); expect(button("母店 上移")).toBeNull();
    expect(container.querySelector('input[aria-label="搜尋店舖"]')).not.toBeNull();
    expect([...container.querySelectorAll("button")].find(node => node.textContent === "封存店舖")).toBeUndefined();
  });
});
