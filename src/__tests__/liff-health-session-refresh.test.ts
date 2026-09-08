import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/liff-health", () => ({ fetchLiffHealthSummary: vi.fn() }));
import { loadHealthWithSessionRefresh } from "@/lib/liff/health-loader";

const input = { idToken: "current-line-token", storeSlug: "taichung" };

describe("health session refresh", () => {
  it("waits for the current LINE session before reading health data", async () => {
    const order: string[] = [];
    const exchange = vi.fn(async () => {
      order.push("verified-session");
      return { status: "session_created" };
    });
    const loadHealth = vi.fn(async () => {
      order.push("read-health");
      return { status: "no_customer" as const };
    });
    expect(await loadHealthWithSessionRefresh(input, { exchange, loadHealth }))
      .toEqual({ status: "no_customer" });
    expect(exchange).toHaveBeenCalledWith(input);
    expect(order).toEqual(["verified-session", "read-health"]);
  });

  it.each([
    [{ status: "need_onboarding" }, "need_onboarding"],
    [{ status: "error", code: "ID_TOKEN_EXPIRED" }, "expired"],
    [{ status: "error", code: "ID_TOKEN_INVALID" }, "expired"],
    [{ status: "error", code: "CONFIG_ERROR" }, "service_unavailable"],
    [{ status: "unknown" }, "service_unavailable"],
    [{}, "service_unavailable"],
    [null, "service_unavailable"],
  ])("never reads a stale customer's health after %j", async (body, status) => {
    const loadHealth = vi.fn();
    const result = await loadHealthWithSessionRefresh(input, {
      exchange: async () => body,
      loadHealth,
    });
    expect(result).toEqual({ status });
    expect(loadHealth).not.toHaveBeenCalled();
  });

  it("does not read data when the exchange network request fails", async () => {
    const loadHealth = vi.fn();
    expect(await loadHealthWithSessionRefresh(input, {
      exchange: async () => { throw new Error("offline"); }, loadHealth,
    })).toEqual({ status: "service_unavailable" });
    expect(loadHealth).not.toHaveBeenCalled();
  });

  it("rejects a missing token without calling either endpoint", async () => {
    const exchange = vi.fn();
    const loadHealth = vi.fn();
    expect(await loadHealthWithSessionRefresh({ ...input, idToken: "" }, { exchange, loadHealth }))
      .toEqual({ status: "expired" });
    expect(exchange).not.toHaveBeenCalled();
    expect(loadHealth).not.toHaveBeenCalled();
  });
});
