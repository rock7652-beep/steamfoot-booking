import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(), revenue: vi.fn(), customers: vi.fn(),
}));
vi.mock("@/server/queries/spa-schedule", () => ({ getSpaScheduleForDay: mocks.schedule }));
vi.mock("@/server/queries/spa-revenue", () => ({ getSpaRevenue: mocks.revenue }));
vi.mock("@/lib/db", () => ({ prisma: { customer: { findMany: mocks.customers } } }));
vi.mock("@/lib/date-utils", () => ({ toLocalDateStr: () => "2026-09-12" }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("@/components/desktop", () => ({
  PageShell: "main", PageHeader: () => null, KpiStrip: () => null,
}));
import { SpaHome } from "@/app/(dashboard)/dashboard/spa-home";

const props = { storeId: "authorized-spa-store", canBookings: true, canCustomers: true, canRevenue: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.schedule.mockResolvedValue([{ id: "booking", customerId: "customer", status: "CONFIRMED", startTime: "10:00", endTime: "11:00", serviceName: "服務" }]);
  mocks.revenue.mockResolvedValue({ collected: 1800, refunded: 0 });
  mocks.customers.mockResolvedValue([{ id: "customer", name: "測試顧客" }]);
});
describe("SPA home permission and tenant boundary", () => {
  it("does not query anything without booking and revenue permissions", async () => {
    const html = renderToStaticMarkup(await SpaHome({ ...props, canBookings: false, canRevenue: false }));
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.revenue).not.toHaveBeenCalled();
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(html).toContain("目前沒有預約或營運查看權限");
  });
  it("uses only the authorized store for today's SPA queries and customer names", async () => {
    await SpaHome(props);
    expect(mocks.schedule).toHaveBeenCalledWith(props.storeId, "2026-09-12");
    expect(mocks.revenue).toHaveBeenCalledWith(props.storeId, "2026-09-12", "2026-09-12", "", 1);
    expect(mocks.customers).toHaveBeenCalledWith({
      where: { storeId: props.storeId, id: { in: ["customer"] } }, select: { id: true, name: true },
    });
  });
  it("hides customer identity and revenue when those permissions are denied", async () => {
    const html = renderToStaticMarkup(await SpaHome({ ...props, canCustomers: false, canRevenue: false }));
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(mocks.revenue).not.toHaveBeenCalled();
    expect(html).toContain("顧客資料受限");
    expect(html).not.toContain("今日收款");
    expect(html).not.toContain("測試顧客");
  });
  it("shows unavailable data explicitly instead of claiming an empty day", async () => {
    mocks.schedule.mockRejectedValue(new Error("unavailable"));
    mocks.revenue.mockRejectedValue(new Error("unavailable"));
    const html = renderToStaticMarkup(await SpaHome(props));
    expect(html).toContain("預約暫時無法讀取");
    expect(html).toContain("收款暫時無法讀取");
    expect(html).not.toContain("今天尚無預約");
    expect(mocks.customers).not.toHaveBeenCalled();
  });
});
