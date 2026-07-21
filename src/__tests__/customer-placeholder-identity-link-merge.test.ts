import { beforeEach, describe, expect, it, vi } from "vitest";

const placeholder = {
  id: "placeholder",
  storeId: "store-1",
  phone: "_oauth_line_user-1",
  email: null,
  userId: "user-1",
  authSource: "LINE",
  lineUserId: "line-1",
  lineName: "LINE user",
  lineLinkStatus: "LINKED",
  lineLinkedAt: null,
  lineBindingCode: null,
  lineBindingCodeCreatedAt: null,
  googleId: null,
  avatar: null,
};

const real = {
  ...placeholder,
  id: "real",
  phone: "0912345678",
  userId: null,
  authSource: "MANUAL",
  lineUserId: null,
  lineName: null,
  lineLinkStatus: "UNLINKED",
};

const identityLink = {
  id: "link-1",
  customerId: placeholder.id,
  userId: "user-1",
  storeId: "store-1",
  provider: "line",
  providerAccountId: "line-1",
  lineUserId: "line-1",
};

const count = vi.fn(async () => 0);
const tx = {
  customer: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
    count,
  },
  customerIdentityLink: {
    findMany: vi.fn(),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
  account: { findUnique: vi.fn(async () => ({ id: "account-1", userId: "user-1" })) },
  booking: { count },
  customerPlanWallet: { count },
  transaction: { count },
  pointRecord: { count },
  referralEvent: { count },
  makeupCredit: { count },
  messageLog: { count },
  checkinPost: { count },
  customerFollowUp: { count },
  talentStageLog: { count },
  bookingMakeupCredit: { count },
  referral: { count },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (callback) => callback(tx)) },
}));

describe("placeholder CustomerIdentityLink merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.customer.findUnique
      .mockResolvedValueOnce(real)
      .mockResolvedValueOnce(placeholder);
    tx.customerIdentityLink.findMany
      .mockResolvedValueOnce([identityLink])
      .mockResolvedValueOnce([]);
  });

  it("moves a login-only identity link to the sole real customer", async () => {
    const { mergePlaceholderCustomerIntoRealCustomer } = await import(
      "@/server/services/customer-merge"
    );

    const result = await mergePlaceholderCustomerIntoRealCustomer({
      placeholderCustomerId: placeholder.id,
      realCustomerId: real.id,
      userId: "user-1",
      basicProfile: { name: "唐玉亭", phone: "0912345678" },
    });

    expect(tx.customerIdentityLink.update).toHaveBeenCalledWith({
      where: { id: identityLink.id },
      data: { customerId: real.id },
    });
    expect(tx.customer.delete).toHaveBeenCalledWith({ where: { id: placeholder.id } });
    expect(result.realId).toBe(real.id);
    expect(result.placeholderDeleted).toBe(true);
  });
});
