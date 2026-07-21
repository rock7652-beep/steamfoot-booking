import { beforeEach, describe, expect, it, vi } from "vitest";

const customerFindUnique = vi.fn();
const linkFindMany = vi.fn();
const linkCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        customer: { findUnique: customerFindUnique },
        customerIdentityLink: { findMany: linkFindMany, create: linkCreate },
      }),
    ),
  },
}));

import { syncVerifiedCentralIdentity } from "@/server/services/sync-verified-central-identity";

const base = {
  entryPoint: "phone_password" as const,
  userId: "user-1",
  storeId: "store-a",
  customerId: "customer-a",
  provider: "phone",
  providerAccountId: "0912345678",
  verifiedPhoneMatches: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  customerFindUnique.mockResolvedValue({
    id: "customer-a",
    storeId: "store-a",
    userId: "user-1",
    mergedIntoCustomerId: null,
  });
  linkFindMany.mockResolvedValue([]);
  linkCreate.mockResolvedValue({});
});

describe("syncVerifiedCentralIdentity", () => {
  it("creates the store-scoped phone link after password verification", async () => {
    await expect(syncVerifiedCentralIdentity(base)).resolves.toEqual({ status: "linked" });

    expect(linkCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        storeId: "store-a",
        customerId: "customer-a",
        provider: "phone",
        providerAccountId: "0912345678",
        lineUserId: null,
      },
    });
  });

  it("is idempotent when the exact verified link already exists", async () => {
    linkFindMany.mockResolvedValue([
      { userId: "user-1", customerId: "customer-a", providerAccountId: "0912345678" },
    ]);

    await expect(syncVerifiedCentralIdentity(base)).resolves.toEqual({
      status: "already_linked",
    });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("fails closed instead of moving another user's identity link", async () => {
    linkFindMany.mockResolvedValue([
      { userId: "user-2", customerId: "customer-b", providerAccountId: "0912345678" },
    ]);

    await expect(syncVerifiedCentralIdentity(base)).resolves.toEqual({
      status: "manual_review",
      reason: "existing_membership_conflict",
    });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-store and merged customer rows without writing", async () => {
    customerFindUnique.mockResolvedValueOnce({
      id: "customer-a",
      storeId: "store-b",
      userId: "user-1",
      mergedIntoCustomerId: null,
    });
    await expect(syncVerifiedCentralIdentity(base)).resolves.toEqual({
      status: "rejected",
      reason: "identity_not_verified",
    });

    customerFindUnique.mockResolvedValueOnce({
      id: "customer-a",
      storeId: "store-a",
      userId: "user-1",
      mergedIntoCustomerId: "customer-target",
    });
    await expect(syncVerifiedCentralIdentity(base)).resolves.toEqual({
      status: "manual_review",
      reason: "merged_customer",
    });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("requires verified phone ownership for an unowned candidate", async () => {
    customerFindUnique.mockResolvedValue({
      id: "customer-a",
      storeId: "store-a",
      userId: null,
      mergedIntoCustomerId: null,
    });

    await expect(syncVerifiedCentralIdentity({
      ...base,
      verifiedPhoneMatches: false,
    })).resolves.toEqual({
      status: "rejected",
      reason: "phone_ownership_not_verified",
    });
    expect(linkCreate).not.toHaveBeenCalled();
  });
});
