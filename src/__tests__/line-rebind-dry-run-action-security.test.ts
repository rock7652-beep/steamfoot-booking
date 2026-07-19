import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  permission: vi.fn(),
  access: vi.fn(),
  request: vi.fn(),
  service: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: h.access }));
vi.mock("@/lib/db", () => ({ prisma: { lineRebindRequest: { findUnique: h.request } } }));
vi.mock("@/server/services/line-rebind", () => ({
  createLineRebindRequest: vi.fn(),
  cancelLineRebindRequest: vi.fn(),
}));
vi.mock("@/server/services/line-rebind-dry-run", () => ({ runLineRebindDryRun: h.service }));

import { dryRunLineRebind } from "@/server/actions/line-rebind";

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
    h.permission.mockResolvedValue({ id: "actor-a", role: "OWNER" });
    h.request.mockResolvedValue({ storeId: "store-a" });
    h.service.mockResolvedValue({ overall: "READY_FOR_REBIND", candidateMaskedUserId: "U123****abcd" });
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
});
