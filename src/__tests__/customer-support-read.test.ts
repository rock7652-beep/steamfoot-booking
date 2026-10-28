// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), advanced: vi.fn() }));
vi.mock("@/server/actions/store-member-connection", () => ({ loadMemberConnectionAction: mocks.connection }));
vi.mock("@/server/actions/customer-panel-advanced", () => ({ getCustomerPanelAdvanced: mocks.advanced }));
import { GET } from "@/app/(dashboard)/dashboard/customer-support-read/route";
import { readCustomerPanelAdvanced, readMemberConnection } from "@/lib/customer-support-read-client";

afterEach(() => { vi.restoreAllMocks(); mocks.connection.mockReset(); mocks.advanced.mockReset(); });

describe("customer support read route", () => {
  it("passes the requested customer to the existing authorized store-scoped reader and does not cache", async () => {
    mocks.connection.mockResolvedValue({ success: false, error: "無權限" });
    const response = await GET(new Request("https://example.test/dashboard/customer-support-read?kind=connection&customerId=other-store"));
    expect(mocks.connection).toHaveBeenCalledWith("other-store");
    expect(await response.json()).toEqual({ success: false, error: "無權限" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.advanced).not.toHaveBeenCalled();
  });
  it("rejects missing, oversized or unknown inputs before invoking readers", async () => {
    for (const query of ["kind=connection", "kind=unknown&customerId=a", `kind=advanced&customerId=${"a".repeat(201)}`]) {
      expect((await GET(new Request(`https://example.test/dashboard/customer-support-read?${query}`))).status).toBe(400);
    }
    expect(mocks.connection).not.toHaveBeenCalled(); expect(mocks.advanced).not.toHaveBeenCalled();
  });
  it("delegates advanced reads to the existing visibility check and preserves denial", async () => {
    mocks.advanced.mockResolvedValue({ success: false, error: "顧客不存在" });
    const result = await GET(new Request("https://example.test/dashboard/customer-support-read?kind=advanced&customerId=another-store"));
    expect(mocks.advanced).toHaveBeenCalledWith("another-store");
    expect(await result.json()).toEqual({ success: false, error: "顧客不存在" });
    expect(result.headers.get("vary")).toBe("Cookie");
  });
  it("preserves the store route and restores dates in the LINE and follow-up data", async () => {
    history.replaceState(null, "", "/s/demo/admin/dashboard/courses?view=customers");
    const response = { success: true, data: { customer: { lineLinkedAt: "2026-10-28T00:00:00.000Z", lineBindingCodeCreatedAt: null, followUps: [{ createdAt: "2026-10-27T00:00:00.000Z" }] } } };
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(response)));
    const result = await readCustomerPanelAdvanced("id a");
    expect(fetcher).toHaveBeenCalledWith("/s/demo/admin/dashboard/customer-support-read?kind=advanced&customerId=id+a", { credentials: "same-origin", cache: "no-store" });
    expect(result.success && result.data.customer.lineLinkedAt).toBeInstanceOf(Date);
    expect(result.success && result.data.customer.followUps[0].createdAt).toBeInstanceOf(Date);
    await readMemberConnection("b");
    expect(fetcher).toHaveBeenLastCalledWith("/s/demo/admin/dashboard/customer-support-read?kind=connection&customerId=b", { credentials: "same-origin", cache: "no-store" });
    history.replaceState(null, "", "/s/demo/admin/customers");
    await readMemberConnection("b");
    expect(fetcher).toHaveBeenLastCalledWith("/s/demo/admin/dashboard/customer-support-read?kind=connection&customerId=b", { credentials: "same-origin", cache: "no-store" });
  });
  it("rejects a failed network read rather than displaying a successful snapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 403 }));
    await expect(readMemberConnection("a")).rejects.toThrow("顧客資料讀取失敗");
  });
});
