import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, updateMany, update, staffFindMany, pushMessage } = vi.hoisted(
  () => ({
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    staffFindMany: vi.fn(),
    pushMessage: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    sessionBalanceNotification: { findFirst, updateMany, update },
    staff: { findMany: staffFindMany },
  },
}));
vi.mock("@/lib/line", () => ({
  pushMessage,
  pushSteamButlerMessage: vi.fn(),
}));
vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://www.steamfoot.com",
}));

import {
  handleSessionBalanceLineResponse,
  SESSION_BALANCE_LATER_COMMAND,
  SESSION_BALANCE_VIP_COMMAND,
} from "@/server/services/session-balance-notifications";

function notification(responseAction: string | null = null) {
  return {
    id: "notification-1",
    responseAction,
    customerId: "customer-1",
    customer: {
      name: "王小美",
      phone: "0912345678",
      assignedStaffId: "staff-1",
    },
    wallet: { plan: { name: "十堂方案" } },
    store: { name: "竹北店" },
  };
}

describe("session balance LINE response closure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(notification());
    updateMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
    staffFindMany.mockResolvedValue([
      {
        id: "staff-1",
        user: { accounts: [{ providerAccountId: "U-manager" }] },
      },
    ]);
    pushMessage.mockResolvedValue({ success: true });
  });

  it("ignores the command when no same-store sent reminder belongs to the LINE user", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      handleSessionBalanceLineResponse({
        storeId: "store-1",
        lineUserId: "U-customer",
        text: SESSION_BALANCE_VIP_COMMAND,
      }),
    ).resolves.toEqual({ handled: false });
    expect(updateMany).not.toHaveBeenCalled();
    expect(pushMessage).not.toHaveBeenCalled();
  });

  it("records VIP interest, replies immediately and notifies the same-store manager", async () => {
    const result = await handleSessionBalanceLineResponse({
      storeId: "store-1",
      lineUserId: "U-customer",
      text: SESSION_BALANCE_VIP_COMMAND,
    });
    expect(result).toMatchObject({ handled: true, response: "VIP_INTEREST" });
    expect(result.handled && result.customerReply).toContain("店長會親自為您說明");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        storeId: "store-1",
        responseAction: null,
      },
      data: {
        responseAction: "VIP_INTEREST",
        responseAt: expect.any(Date),
      },
    });
    expect(pushMessage).toHaveBeenCalledWith(
      "store-1",
      "U-manager",
      [expect.objectContaining({ type: "text" })],
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: {
        managerNotificationStatus: "SENT",
        managerNotificationError: null,
        managerNotifiedAt: expect.any(Date),
      },
    });
  });

  it("records later without notifying a manager", async () => {
    const result = await handleSessionBalanceLineResponse({
      storeId: "store-1",
      lineUserId: "U-customer",
      text: SESSION_BALANCE_LATER_COMMAND,
    });
    expect(result).toMatchObject({ handled: true, response: "LATER" });
    expect(pushMessage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a customer to change from later to VIP interest", async () => {
    findFirst.mockResolvedValue(notification("LATER"));
    await handleSessionBalanceLineResponse({
      storeId: "store-1",
      lineUserId: "U-customer",
      text: SESSION_BALANCE_VIP_COMMAND,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responseAction: "LATER" }),
        data: expect.objectContaining({ responseAction: "VIP_INTEREST" }),
      }),
    );
    expect(pushMessage).toHaveBeenCalledTimes(1);
  });
});
