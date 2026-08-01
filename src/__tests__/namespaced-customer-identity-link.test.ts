import { beforeEach, describe, expect, it, vi } from "vitest";

const findCustomer = vi.fn();
const findLink = vi.fn();
const findLinks = vi.fn();
const upsertLink = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...args: unknown[]) => findCustomer(...args) },
    customerIdentityLink: {
      findUnique: (...args: unknown[]) => findLink(...args),
      findMany: (...args: unknown[]) => findLinks(...args),
      upsert: (...args: unknown[]) => upsertLink(...args),
    },
  },
}));

import {
  createVerifiedCustomerIdentityLink,
} from "@/server/services/namespaced-customer-identity-link";
import {
  readLegacyLineIdentity,
  readLineLoginIdentity,
  readLineMessagingIdentity,
} from "@/server/queries/customer-identity-readers";

const base = {
  userId: "user-1",
  storeId: "store-taichung",
  customerId: "customer-1",
  providerAccountId: "U-login-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  findCustomer.mockResolvedValue({
    id: base.customerId,
    storeId: base.storeId,
    userId: null,
    mergedIntoCustomerId: null,
  });
  findLink.mockResolvedValue(null);
  findLinks.mockResolvedValue([]);
  upsertLink.mockResolvedValue({});
});

describe("createVerifiedCustomerIdentityLink", () => {
  it("creates an idempotent line_login identity without a Messaging ID", async () => {
    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line_login" }))
      .resolves.toEqual({ status: "upserted" });

    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ provider: "line_login", lineUserId: null }),
      update: expect.objectContaining({ lineUserId: null }),
    }));
  });

  it("creates line_messaging independently, so one customer may have both namespaces", async () => {
    await expect(createVerifiedCustomerIdentityLink({
      ...base,
      provider: "line_messaging",
      providerAccountId: "U-messaging-1",
      messagingLineUserId: "U-messaging-1",
    })).resolves.toEqual({ status: "upserted" });

    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        provider: "line_messaging",
        providerAccountId: "U-messaging-1",
        lineUserId: "U-messaging-1",
      }),
    }));
  });

  it("rejects legacy line writes before any database read or write", async () => {
    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line" }))
      .resolves.toEqual({ status: "error", error: "LEGACY_PROVIDER_READ_ONLY" });
    expect(findCustomer).not.toHaveBeenCalled();
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("does not permit a LINE Login writer to carry a Messaging identity", async () => {
    await expect(createVerifiedCustomerIdentityLink({
      ...base,
      provider: "line_login",
      messagingLineUserId: "U-messaging-1",
    })).resolves.toEqual({ status: "error", error: "LINE_LOGIN_CANNOT_WRITE_MESSAGING_ID" });
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("cannot mutate a Customer or an Auth.js Account through the namespace API", async () => {
    const customerUpdate = vi.fn();
    const accountUpsert = vi.fn();
    const tx = {
      customer: { findUnique: findCustomer, update: customerUpdate },
      customerIdentityLink: { findMany: findLinks, findUnique: findLink, upsert: upsertLink },
      account: { upsert: accountUpsert },
    };

    const input = {
      ...base,
      provider: "line_messaging",
      messagingLineUserId: "U-messaging-1",
    };
    // The narrower service transaction contract intentionally excludes both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createVerifiedCustomerIdentityLink({ ...input, tx: tx as any }))
      .resolves.toEqual({ status: "upserted" });

    expect(customerUpdate).not.toHaveBeenCalled();
    expect(accountUpsert).not.toHaveBeenCalled();
  });

  it("fails closed when the provider account belongs to another identity", async () => {
    findLink.mockResolvedValueOnce({ userId: "user-2", customerId: "customer-2" });

    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line_login" }))
      .resolves.toEqual({ status: "error", error: "IDENTITY_PROVIDER_ACCOUNT_CONFLICT" });
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("fails closed when the requested customer belongs to another store", async () => {
    findCustomer.mockResolvedValueOnce({
      id: base.customerId,
      storeId: "store-zhubei",
      userId: null,
      mergedIntoCustomerId: null,
    });

    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line_login" }))
      .resolves.toEqual({ status: "error", error: "CUSTOMER_STORE_MISMATCH" });
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("fails closed when a LINE Login subject is held in any other store", async () => {
    findLinks.mockResolvedValueOnce([{ userId: base.userId, customerId: base.customerId, storeId: "store-zhubei" }]);

    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line_login" }))
      .resolves.toEqual({ status: "error", error: "LINE_LOGIN_GLOBAL_IDENTITY_CONFLICT" });
    expect(upsertLink).not.toHaveBeenCalled();
  });

  it("fails closed when the customer already has a different line_login identity", async () => {
    findLink
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: base.userId, providerAccountId: "U-other" })
      .mockResolvedValueOnce(null);

    await expect(createVerifiedCustomerIdentityLink({ ...base, provider: "line_login" }))
      .resolves.toEqual({ status: "error", error: "CUSTOMER_PROVIDER_CONFLICT" });
    expect(upsertLink).not.toHaveBeenCalled();
  });
});

describe("typed identity readers", () => {
  it("queries exactly its requested namespace with no fallback", async () => {
    const db = { findUnique: findLink };
    await readLineLoginIdentity({ storeId: base.storeId, providerAccountId: "U-1", db });
    await readLineMessagingIdentity({ storeId: base.storeId, providerAccountId: "U-1", db });
    await readLegacyLineIdentity({ storeId: base.storeId, providerAccountId: "U-1", db });

    expect(findLink.mock.calls.map(([input]) => input.where.uq_customer_identity_provider_store.provider))
      .toEqual(["line_login", "line_messaging", "line"]);
  });
});
