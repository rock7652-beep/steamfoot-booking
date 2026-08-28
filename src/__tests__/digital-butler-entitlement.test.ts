import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireStoreFeature: vi.fn(),
  storeFindUnique: vi.fn(),
}));

vi.mock("@/lib/feature-gate", () => ({
  requireStoreFeature: (...args: unknown[]) => h.requireStoreFeature(...args),
}));
vi.mock("@/lib/db", () => ({
  prisma: { store: { findUnique: (...args: unknown[]) => h.storeFindUnique(...args) } },
}));

import {
  requireDigitalButlerConversationActivation,
  requireDigitalButlerEntitlement,
} from "@/lib/digital-butler-entitlement";

describe("Digital Butler backend entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireStoreFeature.mockResolvedValue(undefined);
  });

  it("uses the dedicated HQ feature key and fails closed through feature gate", async () => {
    await requireDigitalButlerEntitlement("store-a");
    expect(h.requireStoreFeature).toHaveBeenCalledWith("store-a", "digital_butler");

    h.requireStoreFeature.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(requireDigitalButlerEntitlement("store-b")).rejects.toThrow("FORBIDDEN");
  });

  it("requires the store-level switch for runtime conversation activation", async () => {
    h.storeFindUnique.mockResolvedValue({ digitalButlerEnabled: false });
    await expect(requireDigitalButlerConversationActivation("store-a")).rejects.toThrow("數位管家目前未啟用");
    expect(h.storeFindUnique).toHaveBeenCalledWith({
      where: { id: "store-a" }, select: { digitalButlerEnabled: true },
    });
  });

  it("permits activation only when both entitlement and store switch are on", async () => {
    h.storeFindUnique.mockResolvedValue({ digitalButlerEnabled: true });
    await expect(requireDigitalButlerConversationActivation("store-a")).resolves.toBeUndefined();
  });

  it("keeps the isolated SPA Demo runtime active without changing a formal store switch", async () => {
    await expect(requireDigitalButlerConversationActivation("demo-store")).resolves.toBeUndefined();
    expect(h.requireStoreFeature).toHaveBeenCalledWith("demo-store", "digital_butler");
    expect(h.storeFindUnique).not.toHaveBeenCalled();
  });
});
