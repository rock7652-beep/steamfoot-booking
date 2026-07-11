import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireSession = vi.fn();
const mockRequireStoreFeature = vi.fn();
const mockGetCanonicalCustomer = vi.fn();
const mockStoreFindUnique = vi.fn();
const mockCustomerFindUnique = vi.fn();

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
}));

vi.mock("@/lib/customer-identity", () => ({
  getCanonicalCustomerForSession: (...args: unknown[]) =>
    mockGetCanonicalCustomer(...args),
  getCanonicalCustomerIdForSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockStoreFindUnique(...args),
    },
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
  },
}));

import { createHealthflowEntryUrl } from "@/server/actions/liff-health";
import { verifyHealthflowBridgeState } from "@/lib/healthflow-identity-bridge";

const USER = {
  id: "user_1",
  role: "CUSTOMER" as const,
  storeId: "store_zhubei",
  customerId: "stale_customer",
  email: null,
};
const CUSTOMER = { id: "customer_1", storeId: "store_zhubei" };

beforeEach(() => {
  vi.stubEnv("HEALTHFLOW_BRIDGE_SECRET", "test-healthflow-bridge-secret");
  mockRequireSession.mockReset();
  mockRequireStoreFeature.mockReset();
  mockGetCanonicalCustomer.mockReset();
  mockStoreFindUnique.mockReset();
  mockCustomerFindUnique.mockReset();
  mockRequireSession.mockResolvedValue(USER);
  mockRequireStoreFeature.mockResolvedValue(undefined);
  mockGetCanonicalCustomer.mockResolvedValue(CUSTOMER);
  mockStoreFindUnique.mockResolvedValue({ id: "store_zhubei" });
  mockCustomerFindUnique.mockResolvedValue({
    id: "customer_1",
    storeId: "store_zhubei",
    mergedIntoCustomerId: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("createHealthflowEntryUrl", () => {
  it("creates a HealthFlow LIFF URL with a signed state for the canonical customer and current store", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await createHealthflowEntryUrl("zhubei");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");

    const url = new URL(result.url);
    expect(url.origin).toBe("https://liff.line.me");
    expect(url.pathname).toBe("/2009744225-9aSc04fR");
    expect(url.searchParams.getAll("state")).toHaveLength(1);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();

    const verified = await verifyHealthflowBridgeState(state);
    expect(verified).toMatchObject({
      ok: true,
      payload: {
        customerId: "customer_1",
        storeId: "store_zhubei",
      },
    });
    if (verified.ok) {
      expect(verified.payload.jti).toEqual(expect.any(String));
      expect(verified.payload.expiresAt).toBeGreaterThan(verified.payload.issuedAt);
    }
    expect(infoSpy).toHaveBeenCalledWith("[healthflow bridge] state trace", {
      phase: "state_created",
      fingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(state);
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("customer_1");
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("store_zhubei");

    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store_zhubei",
      "ai_health_summary",
    );
    expect(mockStoreFindUnique).toHaveBeenCalledWith({
      where: { slug: "zhubei" },
      select: { id: true },
    });
    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      select: { id: true, storeId: true, mergedIntoCustomerId: true },
    });
  });

  it("blocks signed HealthFlow entry when the store health feature is unavailable", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(new Error("FORBIDDEN"));

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toEqual({
      status: "feature_unavailable",
    });

    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store_zhubei",
      "ai_health_summary",
    );
    expect(mockGetCanonicalCustomer).not.toHaveBeenCalled();
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated customers", async () => {
    mockRequireSession.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toEqual({
      status: "no_customer",
    });
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
  });

  it("rejects merged customers", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "customer_1",
      storeId: "store_zhubei",
      mergedIntoCustomerId: "customer_target",
    });

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toEqual({
      status: "no_customer",
    });
  });

  it("rejects when the current LIFF store does not match the canonical customer store", async () => {
    mockStoreFindUnique.mockResolvedValueOnce({ id: "store_hsinchu" });

    await expect(createHealthflowEntryUrl("hsinchu")).resolves.toEqual({
      status: "store_mismatch",
    });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
  });

  it("URL-encodes the signed state exactly once", async () => {
    const result = await createHealthflowEntryUrl("zhubei");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");

    const url = new URL(result.url);
    const rawQuery = result.url.split("?")[1] ?? "";
    expect(rawQuery).toMatch(/^state=/);
    expect(rawQuery).not.toContain("%25");
    expect(decodeURIComponent(rawQuery.slice("state=".length))).toBe(
      url.searchParams.get("state"),
    );
  });

  it("keeps the original LIFF ID and never re-appends the HealthFlow endpoint's own /liff path", async () => {
    const result = await createHealthflowEntryUrl("zhubei");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");

    const url = new URL(result.url);
    expect(url.pathname.split("/").filter(Boolean)).toEqual([
      "2009744225-9aSc04fR",
    ]);
    expect(url.pathname).not.toMatch(/\/liff\/liff/);
  });
});
