import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  probe: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
      findMany: (...args: unknown[]) => mocks.findMany(...args),
      updateMany: (...args: unknown[]) => mocks.updateMany(...args),
    },
  },
}));
vi.mock("@/lib/line", () => ({
  probeStoreLineRecipient: (...args: unknown[]) => mocks.probe(...args),
}));

import { resolvePublicTrialLineCustomer } from "@/server/services/public-trial-line-customer";

const oldCustomer = {
  id: "customer-1",
  name: "王小美",
  assignedStaffId: null,
  lineUserId: "U-login-provider",
  lineLinkStatus: "LINKED",
};
const reboundCustomer = {
  ...oldCustomer,
  lineUserId: "U-store-messaging",
};

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.findMany.mockReset();
  mocks.updateMany.mockReset();
  mocks.probe.mockReset();
  mocks.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(reboundCustomer);
  mocks.findMany.mockResolvedValue([oldCustomer]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("resolvePublicTrialLineCustomer", () => {
  it("repairs a same-phone legacy id only when the store channel rejects it", async () => {
    mocks.probe.mockResolvedValue({ status: "INCOMPATIBLE", httpStatus: 404 });

    await expect(resolvePublicTrialLineCustomer({
      storeId: "store-1",
      phone: "0912345678",
      messagingLineUserId: "U-store-messaging",
    })).resolves.toEqual({ status: "rebound", customer: reboundCustomer });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "customer-1",
        lineUserId: "U-login-provider",
      }),
      data: expect.objectContaining({
        lineUserId: "U-store-messaging",
        lineLinkStatus: "LINKED",
      }),
    }));
  });

  it("does not overwrite an existing reachable store recipient", async () => {
    mocks.probe.mockResolvedValue({ status: "COMPATIBLE" });

    await expect(resolvePublicTrialLineCustomer({
      storeId: "store-1",
      phone: "0912345678",
      messagingLineUserId: "U-store-messaging",
    })).resolves.toEqual({ status: "conflict" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when store identity verification is unavailable", async () => {
    mocks.probe.mockResolvedValue({ status: "UNAVAILABLE", httpStatus: 401 });

    await expect(resolvePublicTrialLineCustomer({
      storeId: "store-1",
      phone: "0912345678",
      messagingLineUserId: "U-store-messaging",
    })).resolves.toEqual({ status: "verification_unavailable" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
