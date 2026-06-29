import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMessageMock = vi.fn(
  async (
    _storeId: string,
    _lineUserId: string,
    _messages: unknown[],
  ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
);
const revalidatePathMock = vi.fn();

const mockPrisma = {
  customer: {
    findUnique: vi.fn(),
  },
  messageTemplate: {
    findUnique: vi.fn(),
  },
  messageLog: {
    create: vi.fn(async ({ data }) => ({ id: "message-log-1", ...data })),
  },
};

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/line", async () => {
  const actual = await vi.importActual<typeof import("@/lib/line")>("@/lib/line");
  return {
    ...actual,
    pushMessage: (storeId: string, lineUserId: string, messages: unknown[]) =>
      pushMessageMock(storeId, lineUserId, messages),
  };
});

vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => ({
    id: "staff-user-1",
    role: "OWNER",
    storeId: "store-hsinchu",
  })),
  requireAdminSession: vi.fn(async () => ({
    id: "admin-user-1",
    role: "ADMIN",
    storeId: "store-hsinchu",
  })),
}));

vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: vi.fn(async () => undefined),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
}));

vi.mock("@/lib/shop-config", () => ({
  getShopConfig: vi.fn(async () => ({ shopName: "以斯帖蒸足坊" })),
}));

vi.mock("@/lib/base-url", () => ({
  deriveBaseUrl: () => "https://example.test",
}));

describe("LINE sending actions are store-aware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMessageMock.mockResolvedValue({ success: true });
  });

  it("testSendLineMessage passes the customer's storeId to pushMessage", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "customer-1",
      name: "Alice",
      storeId: "store-hsinchu",
      lineUserId: "U_hsinchu_customer",
      assignedStaff: { displayName: "Coach" },
    });
    mockPrisma.messageTemplate.findUnique.mockResolvedValueOnce({
      id: "template-1",
      storeId: "store-hsinchu",
      body: "hello {{customerName}}",
    });

    const { testSendLineMessage } = await import("@/server/actions/reminder");
    const result = await testSendLineMessage("customer-1", "template-1");

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-hsinchu", "U_hsinchu_customer", [
      { type: "text", text: expect.any(String) },
    ]);
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-hsinchu",
          status: "SENT",
        }),
      }),
    );
  });

  it("sendOpsLineMessage passes the customer's storeId to pushMessage", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "customer-2",
      name: "Betty",
      storeId: "store-taichung",
      lineUserId: "U_taichung_customer",
      lineLinkStatus: "LINKED",
    });

    const { sendOpsLineMessage } = await import("@/server/actions/ops-line");
    const result = await sendOpsLineMessage("customer-2", "hello");

    expect(result.success).toBe(true);
    expect(pushMessageMock).toHaveBeenCalledWith("store-taichung", "U_taichung_customer", [
      { type: "text", text: "hello" },
    ]);
    expect(mockPrisma.messageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-taichung",
          status: "SENT",
        }),
      }),
    );
  });
});
