import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCustomerFindUnique = vi.fn();

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    staff: { findUnique: vi.fn() },
  },
}));

import {
  getCurrentCustomer,
  resolveValidatedCustomerId,
} from "@/lib/session";

describe("session Customer merged guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        customerId: "merged-shell",
        storeId: "store-zhubei",
      },
    });
  });

  it("getCurrentCustomer only accepts an unmerged session Customer", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await expect(getCurrentCustomer()).resolves.toBeNull();
    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: {
        id: "merged-shell",
        mergedIntoCustomerId: null,
        mergedAt: null,
      },
    });
  });

  it("resolveValidatedCustomerId treats a merged session id as stale", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await expect(
      resolveValidatedCustomerId({ id: "user-1", customerId: "merged-shell" }),
    ).resolves.toBeNull();
    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: {
        id: "merged-shell",
        mergedIntoCustomerId: null,
        mergedAt: null,
      },
      select: { id: true },
    });
  });
});
