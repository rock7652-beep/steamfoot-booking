import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ user: vi.fn(), permission: vi.fn(), store: vi.fn(), module: vi.fn(), scope: vi.fn(), page: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user }));
vi.mock("@/lib/permissions", () => ({ checkPermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ requireCourseStore: m.module }));
vi.mock("@/server/queries/course-home", () => ({ courseCustomerStaffScope: m.scope }));
vi.mock("@/server/queries/course-unassigned-plans", () => ({ getCourseUnassignedPlanPage: m.page }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children, href }: { children: string; href: string }) => createElement("a", { href }, children) }));
vi.mock("@/components/desktop", () => ({ PageShell: ({ children }: { children: string }) => createElement("main", null, children), PageHeader: ({ title, subtitle, actions }: { title: string; subtitle: string; actions: string }) => createElement("header", null, title, subtitle, actions) }));
vi.mock("@/app/(dashboard)/dashboard/courses/home-controls", () => ({ HomeRetry: () => createElement("button", null, "重新讀取") }));
import Page from "@/app/(dashboard)/dashboard/courses/unassigned-plans/page";
const render = async (page = "1") => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ page }) }));
beforeEach(() => {
  vi.resetAllMocks(); m.user.mockResolvedValue({ role: "OWNER", staffId: "s" }); m.permission.mockResolvedValue(true); m.store.mockResolvedValue("a"); m.scope.mockReturnValue("s"); m.page.mockResolvedValue({ total: 0, page: 1, pageSize: 30, rows: [] });
});
describe("unassigned course page", () => {
  it.each(["customer.read", "wallet.read"])("blocks missing %s before querying", async denied => {
    m.permission.mockImplementation(async (_role, _staff, permission) => permission !== denied);
    await expect(render()).rejects.toThrow("NOT_FOUND"); expect(m.page).not.toHaveBeenCalled();
  });
  it("uses the resolved store and visibility, not caller-provided IDs", async () => {
    const html = await render("2"); expect(m.module).toHaveBeenCalledWith("a"); expect(m.page).toHaveBeenCalledWith("a", "s", 2); expect(html).toContain("目前沒有符合條件"); expect(html).toContain("不會自動傳送 LINE");
  });
  it("renders bounded customer drilldown and pagination without financial write buttons", async () => {
    m.page.mockResolvedValue({ total: 75, page: 2, pageSize: 30, rows: [{ id: "a/b", name: "學員 A", phoneLastFour: "0123", staffName: "店長", createdAt: "2026-09-20T23:00:00Z" }] });
    const html = await render("2"); expect(html).toContain("customerId=a%2Fb"); expect(html).toContain("2026-09-21"); expect(html).toContain("page=1"); expect(html).toContain("page=3"); expect(html).not.toContain("確認收款");
  });
  it("reports failures as unknown, not zero people", async () => {
    m.page.mockRejectedValue(new Error("offline")); const html = await render(); expect(html).toContain("尚無法確認人數"); expect(html).not.toContain("目前沒有符合條件");
  });
});
