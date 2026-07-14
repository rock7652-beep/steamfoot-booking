import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  customerFindFirst: vi.fn(),
  createReferralEvent: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db", () => ({
  prisma: { customer: { findFirst: mocks.customerFindFirst } },
}));
vi.mock("@/server/services/referral-events", () => ({
  createReferralEvent: mocks.createReferralEvent,
}));

import {
  recordReferralEvent,
  trackCurrentCustomerShare,
} from "@/server/actions/referral-events";

describe("trackCurrentCustomerShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      id: "user-a",
      role: "CUSTOMER",
      customerId: "customer-a",
      storeId: "stale-client-store",
    });
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-a",
      storeId: "store-a",
    });
    mocks.createReferralEvent.mockResolvedValue({ id: "event-a" });
  });

  it("忽略 client storeId / referrerId，使用 session + DB canonical Customer", async () => {
    await trackCurrentCustomerShare({
      source: "my-perks:line",
      storeId: "store-b",
      referrerId: "customer-b",
    });

    expect(mocks.createReferralEvent).toHaveBeenCalledWith({
      storeId: "store-a",
      referrerId: "customer-a",
      type: "SHARE",
      source: "my-perks:line",
    });
  });

  it("無有效 Customer 時靜默停止", async () => {
    mocks.customerFindFirst.mockResolvedValue(null);

    await trackCurrentCustomerShare({ source: "copy" });

    expect(mocks.createReferralEvent).not.toHaveBeenCalled();
  });

  it("非 Customer session 不寫 SHARE", async () => {
    mocks.requireSession.mockResolvedValue({
      id: "staff-a",
      role: "OWNER",
      customerId: null,
      storeId: "store-a",
    });

    await trackCurrentCustomerShare({ source: "copy" });

    expect(mocks.customerFindFirst).not.toHaveBeenCalled();
    expect(mocks.createReferralEvent).not.toHaveBeenCalled();
  });
});

describe("recordReferralEvent caller access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      id: "user-a",
      role: "CUSTOMER",
      customerId: "customer-a",
      storeId: "store-a",
    });
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-a",
      storeId: "store-a",
    });
    mocks.createReferralEvent.mockResolvedValue({ id: "event-a" });
  });

  it("Customer 不可替其他店寫 generic event", async () => {
    const result = await recordReferralEvent({
      storeId: "store-b",
      type: "SHARE",
      referrerId: "customer-a",
    });

    expect(result.success).toBe(false);
    expect(mocks.createReferralEvent).not.toHaveBeenCalled();
  });

  it("Customer 不可替其他推薦人寫 generic event", async () => {
    const result = await recordReferralEvent({
      storeId: "store-a",
      type: "SHARE",
      referrerId: "customer-b",
    });

    expect(result.success).toBe(false);
    expect(mocks.createReferralEvent).not.toHaveBeenCalled();
  });
});
