import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  storeFindUnique: vi.fn(), customerFindMany: vi.fn(), transaction: vi.fn(),
  userCreate: vi.fn(), customerCreate: vi.fn(), linkCreate: vi.fn(),
  auditDeleteMany: vi.fn(), candidateDelete: vi.fn(), requestDelete: vi.fn(),
  linkDelete: vi.fn(), customerDelete: vi.fn(), userDelete: vi.fn(),
  createRequest: vi.fn(), captureCandidate: vi.fn(),
}));

vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: h.storeFindUnique },
    customer: { findMany: h.customerFindMany },
    $transaction: (callback: (tx: unknown) => unknown) => h.transaction(callback),
  },
}));
vi.mock("@/server/services/line-rebind", () => ({
  createLineRebindRequest: h.createRequest,
  captureLineRebindCandidate: h.captureCandidate,
}));

import { PR2_SMOKE_MARKER, cleanupPr2SmokeFixture, createPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";

function tx() {
  return {
    user: { create: h.userCreate, delete: h.userDelete },
    customer: { create: h.customerCreate, delete: h.customerDelete },
    customerIdentityLink: { create: h.linkCreate, delete: h.linkDelete },
    auditLog: { deleteMany: h.auditDeleteMany },
    lineRebindCandidate: { delete: h.candidateDelete },
    lineRebindRequest: { delete: h.requestDelete },
  };
}

function validGraph() {
  return {
    id: "customer-fixture", userId: "user-fixture",
    identityLinks: [{ id: "link-fixture", provider: "line", providerAccountId: "Upr2smokeold000000000000000000001" }],
    lineRebindRequests: [{ id: "request-fixture", reason: `${PR2_SMOKE_MARKER} browser smoke fixture`, candidate: { id: "candidate-fixture", webhookEventKey: "pr2-smoke-fixture-v1-candidate" } }],
    _count: { bookings: 0, transactions: 0, planWallets: 0, messageLogs: 0 },
  };
}

describe("PR-2 preview smoke fixture service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.storeFindUnique.mockResolvedValue({ id: "staging-store", isDemo: true, slug: "staging" });
    h.customerFindMany.mockResolvedValue([]);
    h.transaction.mockImplementation((callback) => callback(tx()));
    h.userCreate.mockResolvedValue({ id: "user-fixture" });
    h.customerCreate.mockResolvedValue({ id: "customer-fixture" });
    h.createRequest.mockResolvedValue({ status: "created", requestId: "request-fixture", expiresAt: new Date("2099-01-01T00:00:00.000Z") });
    h.captureCandidate.mockResolvedValue({ status: "captured" });
  });

  it("creates only a new marked fixture and delegates capture without external LINE calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(createPr2SmokeFixture("owner-a")).resolves.toEqual({ customerId: "customer-fixture", requestId: "request-fixture", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(h.customerCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: PR2_SMOKE_MARKER, lineLinkStatus: "LINKED" }) }));
    expect(h.createRequest).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer-fixture", createdByUserId: "owner-a" }));
    expect(h.captureCandidate).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("cleans up only one complete marked fixture in dependency-safe order", async () => {
    h.customerFindMany.mockResolvedValue([validGraph()]);
    await expect(cleanupPr2SmokeFixture()).resolves.toEqual({ removed: true });
    expect(h.auditDeleteMany).toHaveBeenCalledWith({ where: { targetType: "LineRebindRequest", targetId: "request-fixture" } });
    expect(h.candidateDelete).toHaveBeenCalledBefore(h.requestDelete);
    expect(h.requestDelete).toHaveBeenCalledBefore(h.linkDelete);
    expect(h.linkDelete).toHaveBeenCalledBefore(h.customerDelete);
  });

  it("fails closed when more than one marked fixture exists", async () => {
    h.customerFindMany.mockResolvedValue([validGraph(), validGraph()]);
    await expect(cleanupPr2SmokeFixture()).rejects.toThrow("PR2_SMOKE_FIXTURE_MULTIPLE");
    expect(h.transaction).not.toHaveBeenCalled();
  });
});
