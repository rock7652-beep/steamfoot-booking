import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: vi.fn(), stores: vi.fn(), auditRun: vi.fn(), createAudit: vi.fn(), repair: vi.fn(),
  diagnoseGraph: vi.fn(), diagnoseToken: vi.fn(), createReferral: vi.fn(),
}));
vi.mock("react", () => ({ cache: <T>(fn: T): T => fn }));
vi.mock("@/lib/session", () => ({ getCurrentUser: m.user, requireSession: m.user }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findMany: m.stores }, messengerAuditRun: { findUnique: m.auditRun },
} }));
vi.mock("@/lib/permissions", () => ({
  isOwner: (role: string) => role === "ADMIN",
  isNonOwnerStaff: (role: string) => ["OWNER", "MANAGER", "STAFF", "PARTNER"].includes(role),
}));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn(async () => true), requireStoreFeature: vi.fn() }));
vi.mock("@/server/services/messenger-production-audit", () => ({ createMessengerAuditRun: m.createAudit }));
vi.mock("@/server/services/messenger-page-repair", () => ({ repairMessengerPageBinding: m.repair }));
vi.mock("@/server/services/messenger-graph-diagnostic", () => ({ diagnoseMessengerGraph: m.diagnoseGraph }));
vi.mock("@/server/services/messenger-token-fingerprint", () => ({ diagnoseMessengerPageToken: m.diagnoseToken, getTokenFormat: vi.fn() }));
vi.mock("@/server/services/referral-events", () => ({ createReferralEvent: m.createReferral }));

import { registerHqStoreViewContext } from "@/lib/hq-store-view-context";
import { POST as audit, resetMessengerAuditRateLimitForTests } from "@/app/api/admin/messenger/audit/route";
import { GET as readAudit } from "@/app/api/admin/messenger/audit/[id]/route";
import { POST as repair, resetMessengerRepairRateLimitForTests } from "@/app/api/admin/messenger/repair/route";
import { POST as graph, resetMessengerGraphDiagnosticRateLimitForTests } from "@/app/api/admin/messenger/graph-diagnostic/route";
import { POST as fingerprint, resetMessengerTokenFingerprintRateLimitForTests } from "@/app/api/admin/messenger/token-fingerprint/route";
import { recordReferralEvent, trackReferralEvent } from "@/server/actions/referral-events";

function post(storeId: string) {
  return new Request("https://preview.example/api/admin/messenger/test", {
    method: "POST",
    body: JSON.stringify({ storeId, localFingerprint: "0123456789ab", localFormat: {
      tokenLength: 12, hasWrappingQuotes: false, hasNewline: false, trimChangesLength: false,
    } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMessengerAuditRateLimitForTests();
  resetMessengerRepairRateLimitForTests();
  resetMessengerGraphDiagnosticRateLimitForTests();
  resetMessengerTokenFingerprintRateLimitForTests();
  m.user.mockResolvedValue(registerHqStoreViewContext({
    id: "actual-hq-user", role: "ADMIN", staffId: null, storeId: null, loginRecordId: "actual-hq-login",
  }, "store-a"));
  m.stores.mockResolvedValue([
    { id: "store-a", slug: "zhubei", name: "A", isDefault: false },
    { id: "store-b", slug: "other", name: "B", isDefault: false },
  ]);
  m.auditRun.mockResolvedValue({ id: "run-b", storeId: "store-b" });
  m.createAudit.mockResolvedValue({ id: "new-run" });
  m.repair.mockResolvedValue({ status: "repaired" });
  m.diagnoseGraph.mockResolvedValue({ classification: "NO_GRAPH_ERROR" });
  m.diagnoseToken.mockResolvedValue({ fingerprintsMatch: true });
  m.createReferral.mockResolvedValue({ id: "referral" });
});

describe("HQ store view uses real store authorization in messenger endpoints", () => {
  it.each([
    ["audit", audit], ["repair", repair], ["graph diagnostic", graph], ["token fingerprint", fingerprint],
  ] as const)("blocks another store's %s before service work", async (_name, handler) => {
    expect((await handler(post("store-b"))).status).toBe(403);
    expect(m.stores).not.toHaveBeenCalled();
    for (const service of [m.createAudit, m.repair, m.diagnoseGraph, m.diagnoseToken]) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it("blocks reading another store's saved audit", async () => {
    const response = await readAudit(new Request("https://preview.example/api/admin/messenger/audit/run-b"), {
      params: Promise.resolve({ id: "run-b" }),
    });
    expect(response.status).toBe(403);
  });

  it("permits same-store operations while retaining the true HQ actor", async () => {
    expect((await audit(post("store-a"))).status).toBe(200);
    expect((await repair(post("store-a"))).status).toBe(200);
    expect(m.createAudit).toHaveBeenCalledWith({ storeId: "store-a", storeSlug: "zhubei", requestedByUserId: "actual-hq-user" });
    expect(m.repair).toHaveBeenCalledWith({ storeId: "store-a", storeSlug: "zhubei", requestedByUserId: "actual-hq-user" });
    expect(await m.user()).toMatchObject({ role: "ADMIN", staffId: null, loginRecordId: "actual-hq-login" });
  });
});

describe("HQ store-view referral writes", () => {
  it("rejects another store before either referral action writes", async () => {
    expect((await recordReferralEvent({ storeId: "store-b", type: "REGISTER" })).success).toBe(false);
    await trackReferralEvent({ storeId: "store-b", type: "REGISTER" });
    expect(m.createReferral).not.toHaveBeenCalled();
  });

  it("retains same-store referral writes without replacing the real actor", async () => {
    expect(await recordReferralEvent({ storeId: "store-a", type: "REGISTER" })).toEqual({ success: true, data: { eventId: "referral" } });
    expect(m.createReferral).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store-a" }));
    expect(await m.user()).toMatchObject({ id: "actual-hq-user", role: "ADMIN", staffId: null });
  });
});
