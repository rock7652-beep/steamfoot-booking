import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  permission: vi.fn(),
  access: vi.fn(),
  request: vi.fn(),
  service: vi.fn(),
  fixtureCreate: vi.fn(),
  fixtureCleanup: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: h.access }));
vi.mock("@/lib/db", () => ({ prisma: { lineRebindRequest: { findUnique: h.request } } }));
vi.mock("@/server/services/line-rebind", () => ({
  createLineRebindRequest: vi.fn(),
  cancelLineRebindRequest: vi.fn(),
}));
vi.mock("@/server/services/line-rebind-dry-run", () => ({ runLineRebindDryRun: h.service }));
vi.mock("@/server/services/line-rebind-smoke-fixture", () => ({ createPr2SmokeFixture: h.fixtureCreate, cleanupPr2SmokeFixture: h.fixtureCleanup }));

import { cleanupPr2PreviewSmokeFixture, createPr2PreviewSmokeFixture, dryRunLineRebind } from "@/server/actions/line-rebind";

const sentinels = {
  oldLineUserId: "Uold-line-user-id-sentinel",
  candidateLineUserId: "Ucandidate-line-user-id-sentinel",
  phone: "0912-345-678",
  ciphertext: "ciphertext-sentinel",
  iv: "iv-sentinel",
  authTag: "auth-tag-sentinel",
  encryptionKey: "encryption-key-sentinel",
  lineAccessToken: "line-access-token-sentinel",
  lineChannelSecret: "line-channel-secret-sentinel",
};

const consoleSpies = [
  vi.spyOn(console, "log").mockImplementation(() => undefined),
  vi.spyOn(console, "warn").mockImplementation(() => undefined),
  vi.spyOn(console, "error").mockImplementation(() => undefined),
];

function assertNoSensitiveValues(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const sentinel of Object.values(sentinels)) {
    expect(serialized).not.toContain(sentinel);
  }
}

function assertConsoleHasNoSensitiveValues() {
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) assertNoSensitiveValues(call);
  }
}

describe("LINE rebind dry-run action security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.access.mockReset();
    h.access.mockImplementation(() => undefined);
    h.permission.mockResolvedValue({ id: "actor-a", role: "OWNER" });
    h.request.mockResolvedValue({ storeId: "store-a" });
    h.service.mockResolvedValue({ overall: "READY_FOR_REBIND", candidateMaskedUserId: "U123****abcd" });
    h.fixtureCreate.mockResolvedValue({ customerId: "fixture-customer", requestId: "fixture-request", expiresAt: "2099-01-01T00:00:00.000Z" });
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = "postgresql://db.ttworfzgwejdeolegkxl.supabase.co/staging";
    process.env.DIRECT_URL = "postgresql://db.ttworfzgwejdeolegkxl.supabase.co/staging";
  });

  afterEach(() => assertConsoleHasNoSensitiveValues());

  afterAll(() => {
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it.each(["OWNER", "ADMIN"])("allows %s with permission", async (role) => {
    h.permission.mockResolvedValue({ id: "actor-a", role });

    expect((await dryRunLineRebind("request-a")).success).toBe(true);
  });

  it("rejects a missing customer.identity.rebind permission before querying or running the service", async () => {
    h.permission.mockRejectedValue(new Error(`FORBIDDEN ${sentinels.lineAccessToken}`));

    const result = await dryRunLineRebind("request-a");

    expect(result.success).toBe(false);
    expect(h.request).not.toHaveBeenCalled();
    expect(h.service).not.toHaveBeenCalled();
    assertNoSensitiveValues(result);
  });

  it("rejects users without access to the request store before running the service", async () => {
    h.access.mockImplementation(() => {
      throw new Error(`FORBIDDEN ${sentinels.lineChannelSecret}`);
    });

    const result = await dryRunLineRebind("request-a");

    expect(result.success).toBe(false);
    expect(h.service).not.toHaveBeenCalled();
    assertNoSensitiveValues(result);
  });

  it("rejects non-admin roles", async () => {
    h.permission.mockResolvedValue({ id: "actor-a", role: "STAFF" });

    const result = await dryRunLineRebind("request-a");

    expect(result.success).toBe(false);
    expect(h.request).not.toHaveBeenCalled();
    expect(h.service).not.toHaveBeenCalled();
  });

  it("keeps all console arguments free of LINE IDs, customer data, and encryption secrets", async () => {
    h.permission.mockRejectedValue(
      new Error(Object.values(sentinels).join(" ")),
    );

    const result = await dryRunLineRebind("request-a");

    expect(result.success).toBe(false);
    assertNoSensitiveValues(result);
    assertConsoleHasNoSensitiveValues();
  });

  it("rejects the temporary fixture action outside Preview before service execution", async () => {
    process.env.VERCEL_ENV = "production";
    const result = await createPr2PreviewSmokeFixture();
    expect(result.success).toBe(false);
    expect(h.fixtureCreate).not.toHaveBeenCalled();
  });

  it("rejects a production database ref before service execution", async () => {
    process.env.DATABASE_URL = "postgresql://db.qijlnhtpbintanzpxkvf.supabase.co/production";
    const result = await createPr2PreviewSmokeFixture();
    expect(result.success).toBe(false);
    expect(h.fixtureCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-OWNER fixture operator before service execution", async () => {
    h.permission.mockResolvedValue({ id: "actor-a", role: "ADMIN" });
    const result = await createPr2PreviewSmokeFixture();
    expect(result.success).toBe(false);
    expect(h.fixtureCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing fixture permission before service execution", async () => {
    h.permission.mockRejectedValue(new Error(`FORBIDDEN ${sentinels.lineAccessToken}`));
    const result = await createPr2PreviewSmokeFixture();
    expect(result.success).toBe(false);
    expect(h.fixtureCreate).not.toHaveBeenCalled();
    assertNoSensitiveValues(result);
  });

  it("requires OWNER, permission, store access, then creates only the fixed fixture", async () => {
    const result = await createPr2PreviewSmokeFixture();
    expect(result.success).toBe(true);
    expect(h.access).toHaveBeenCalledWith({ id: "actor-a", role: "OWNER" }, "staging-store");
    expect(h.fixtureCreate).toHaveBeenCalledWith("actor-a");
  });

  it("uses the same guarded OWNER path for cleanup", async () => {
    h.fixtureCleanup.mockResolvedValue({ removed: true });
    await expect(cleanupPr2PreviewSmokeFixture()).resolves.toEqual({ success: true, data: { removed: true } });
    expect(h.fixtureCleanup).toHaveBeenCalledOnce();
  });
});
