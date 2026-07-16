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
const REQUEST_ID = expect.stringMatching(/^hf_entry_[0-9a-f-]{36}$/);

function healthflowResultLogs(infoSpy: { mock: { calls: unknown[][] } }) {
  return infoSpy.mock.calls
    .map((call) => call[0])
    .filter(
      (message): message is string =>
        typeof message === "string" && message.startsWith("{"),
    )
    .map((message) => JSON.parse(message));
}

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
    expect(result.requestId).toEqual(REQUEST_ID);

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

    expect(healthflowResultLogs(infoSpy)).toEqual([
      expect.objectContaining({
        event: "healthflow_entry_result",
        requestId: result.requestId,
        resultStatus: "ok",
        storeSlug: "zhubei",
        anonymizedUserId: expect.stringMatching(/^[a-f0-9]{12}$/),
        anonymizedCustomerId: expect.stringMatching(/^[a-f0-9]{12}$/),
        canonicalCustomerResolved: true,
        resolvedCustomerStoreSlug: "zhubei",
        entitlementPassed: true,
        timestamp: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(healthflowResultLogs(infoSpy))).not.toContain("user_1");
    expect(JSON.stringify(healthflowResultLogs(infoSpy))).not.toContain(
      "customer_1",
    );

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
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mockRequireStoreFeature.mockRejectedValueOnce(new Error("FORBIDDEN"));

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toMatchObject({
      status: "feature_unavailable",
      requestId: REQUEST_ID,
    });
    expect(healthflowResultLogs(infoSpy)).toEqual([
      expect.objectContaining({
        event: "healthflow_entry_result",
        resultStatus: "feature_unavailable",
        entitlementPassed: false,
      }),
    ]);

    expect(mockRequireStoreFeature).toHaveBeenCalledWith(
      "store_zhubei",
      "ai_health_summary",
    );
    expect(mockGetCanonicalCustomer).not.toHaveBeenCalled();
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated customers", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mockRequireSession.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toMatchObject({
      status: "no_customer",
      requestId: REQUEST_ID,
    });
    expect(healthflowResultLogs(infoSpy)).toEqual([
      expect.objectContaining({
        event: "healthflow_entry_result",
        resultStatus: "no_customer",
        canonicalCustomerResolved: false,
        entitlementPassed: "unknown",
      }),
    ]);
    expect(mockStoreFindUnique).not.toHaveBeenCalled();
  });

  it("rejects merged customers", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "customer_1",
      storeId: "store_zhubei",
      mergedIntoCustomerId: "customer_target",
    });

    await expect(createHealthflowEntryUrl("zhubei")).resolves.toMatchObject({
      status: "no_customer",
      requestId: REQUEST_ID,
    });
  });

  it("rejects when the current LIFF store does not match the canonical customer store", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    mockStoreFindUnique.mockResolvedValueOnce({ id: "store_hsinchu" });

    await expect(createHealthflowEntryUrl("hsinchu")).resolves.toMatchObject({
      status: "store_mismatch",
      requestId: REQUEST_ID,
    });
    expect(healthflowResultLogs(infoSpy)).toEqual([
      expect.objectContaining({
        event: "healthflow_entry_result",
        resultStatus: "store_mismatch",
        canonicalCustomerResolved: true,
        resolvedCustomerStoreSlug: null,
        entitlementPassed: true,
      }),
    ]);
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
  });

  it("returns service_unavailable and logs a sanitized exception", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCustomerFindUnique.mockRejectedValueOnce(
      new TypeError(
        "database offline for customer_1 using test-healthflow-bridge-secret",
      ),
    );

    const actionResult = await createHealthflowEntryUrl("zhubei");

    expect(actionResult).toMatchObject({
      status: "service_unavailable",
      requestId: REQUEST_ID,
    });
    expect(healthflowResultLogs(infoSpy)).toEqual([
      expect.objectContaining({
        event: "healthflow_entry_result",
        resultStatus: "service_unavailable",
      }),
    ]);

    const exceptionLog = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
    expect(exceptionLog).toMatchObject({
      event: "healthflow_entry_exception",
      requestId:
        actionResult.status === "service_unavailable"
          ? actionResult.requestId
          : expect.any(String),
      storeSlug: "zhubei",
      name: "TypeError",
      message: "database offline for [REDACTED] using [REDACTED]",
      stack: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(exceptionLog)).not.toContain("user_1");
    expect(JSON.stringify(exceptionLog)).not.toContain("customer_1");
    expect(JSON.stringify(exceptionLog)).not.toContain(
      "test-healthflow-bridge-secret",
    );
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
