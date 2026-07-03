import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const OWNER = { id: "user-owner", storeId: "store-a", role: "OWNER", staffId: "staff-a" };

const mockRequirePermission = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockFollowUpCreate = vi.fn();
const mockAssertStoreAccess = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRequireStoreFeature = vi.fn();

vi.mock("@/lib/permissions", () => ({
  requireWritablePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: (...args: unknown[]) => mockAssertStoreAccess(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => mockRequireStoreFeature(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    customerFollowUp: {
      create: (...args: unknown[]) => mockFollowUpCreate(...args),
    },
  },
}));

import { createCustomerFollowUpAction } from "@/server/actions/customer-follow-up";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(OWNER);
  mockAssertStoreAccess.mockReturnValue(undefined);
  mockRequireStoreFeature.mockResolvedValue(undefined);
  mockCustomerFindUnique.mockResolvedValue({
    id: "customer-a",
    storeId: "store-a",
    mergedIntoCustomerId: null,
    user: { status: "ACTIVE" },
  });
  mockFollowUpCreate.mockResolvedValue({ id: "follow-up-a" });
});

describe("createCustomerFollowUpAction", () => {
  it("creates a follow-up with customer.update permission and customer store", async () => {
    const result = await createCustomerFollowUpAction({
      customerId: "customer-a",
      result: "NO_ANSWER",
      note: "  下午再打一次  ",
    });

    expect(result).toEqual({ success: true, data: { followUpId: "follow-up-a" } });
    expect(mockRequirePermission).toHaveBeenCalledWith("customer.update");
    expect(mockAssertStoreAccess).toHaveBeenCalledWith(OWNER, "store-a");
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-a", "customer_care");
    expect(mockFollowUpCreate).toHaveBeenCalledWith({
      data: {
        customerId: "customer-a",
        storeId: "store-a",
        createdByUserId: "user-owner",
        result: "NO_ANSWER",
        note: "下午再打一次",
      },
      select: { id: true },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/growth");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/customers");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/customers/customer-a");
  });

  it("stores blank note as null", async () => {
    await createCustomerFollowUpAction({
      customerId: "customer-a",
      result: "CONTACTED",
      note: "   ",
    });

    expect(mockFollowUpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: null }),
      }),
    );
  });

  it("does not create when user lacks customer.update", async () => {
    mockRequirePermission.mockRejectedValueOnce(new AppError("FORBIDDEN", "無權限"));

    const result = await createCustomerFollowUpAction({
      customerId: "customer-a",
      result: "CONTACTED",
      note: null,
    });

    expect(result.success).toBe(false);
    expect(mockFollowUpCreate).not.toHaveBeenCalled();
  });

  it("does not create when customer_care is not enabled for the store", async () => {
    mockRequireStoreFeature.mockRejectedValueOnce(new AppError("FORBIDDEN", "未開通"));

    const result = await createCustomerFollowUpAction({
      customerId: "customer-a",
      result: "CONTACTED",
      note: null,
    });

    expect(result.success).toBe(false);
    expect(mockRequireStoreFeature).toHaveBeenCalledWith("store-a", "customer_care");
    expect(mockFollowUpCreate).not.toHaveBeenCalled();
  });

  it("does not create for merged customers", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "customer-a",
      storeId: "store-a",
      mergedIntoCustomerId: "customer-b",
      user: { status: "ACTIVE" },
    });

    const result = await createCustomerFollowUpAction({
      customerId: "customer-a",
      result: "CONTACTED",
      note: null,
    });

    expect(result.success).toBe(false);
    expect(mockFollowUpCreate).not.toHaveBeenCalled();
  });
});
