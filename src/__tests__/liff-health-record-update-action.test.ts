import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireSession: vi.fn(),
  storeFindUnique: vi.fn(),
  requireStoreFeature: vi.fn(),
  resolveMemberships: vi.fn(),
  recordFindFirst: vi.fn(),
  recordUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSession: (...args: unknown[]) => h.requireSession(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: { findUnique: (...args: unknown[]) => h.storeFindUnique(...args) },
    customerHealthRecord: {
      findFirst: (...args: unknown[]) => h.recordFindFirst(...args),
      update: (...args: unknown[]) => h.recordUpdate(...args),
    },
  },
}));
vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => h.requireStoreFeature(...args),
}));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMembershipsForUser: (...args: unknown[]) =>
    h.resolveMemberships(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => h.revalidatePath(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => h.redirect(...args),
}));

import { updateLiffHealthRecord } from "@/server/actions/liff-health";

function form(recordId = "record-owned") {
  const data = new FormData();
  data.set("requestId", "8b447f1d-7395-424a-9075-0bca361f1cb4");
  data.set("storeSlug", "zhubei");
  data.set("recordId", recordId);
  data.set("measuredAt", "2026-08-30");
  data.set("weight", "60.5");
  data.set("metabolicAge", "42");
  return data;
}

describe("updateLiffHealthRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireSession.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    h.storeFindUnique.mockResolvedValue({ id: "store-current", slug: "zhubei" });
    h.requireStoreFeature.mockResolvedValue(undefined);
    h.resolveMemberships.mockResolvedValue({
      memberships: [
        { storeId: "store-owned", customerId: "customer-owned" },
      ],
      conflicts: [],
    });
    h.recordFindFirst.mockResolvedValue({
      id: "record-owned",
      customer: { height: 165 },
    });
    h.recordUpdate.mockResolvedValue({ id: "record-owned" });
  });

  it("updates one record inside the signed-in customer's verified scope", async () => {
    await updateLiffHealthRecord({ error: null }, form());

    expect(h.recordFindFirst).toHaveBeenCalledWith({
      where: {
        id: "record-owned",
        OR: [{ storeId: "store-owned", customerId: "customer-owned" }],
      },
      select: { id: true, customer: { select: { height: true } } },
    });
    expect(h.recordUpdate).toHaveBeenCalledWith({
      where: { id: "record-owned" },
      data: expect.objectContaining({
        weight: 60.5,
        metabolicAge: 42,
      }),
    });
    expect(h.revalidatePath).toHaveBeenCalledWith("/s/zhubei/liff/health");
    expect(h.redirect).toHaveBeenCalledWith("/s/zhubei/liff/health?updated=1");
  });

  it("rejects a record outside the customer's verified scope", async () => {
    h.recordFindFirst.mockResolvedValueOnce(null);

    await expect(
      updateLiffHealthRecord({ error: null }, form("record-other")),
    ).resolves.toEqual({ error: "找不到這筆紀錄，或您沒有修改權限" });
    expect(h.recordUpdate).not.toHaveBeenCalled();
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
