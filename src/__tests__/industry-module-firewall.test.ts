import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

describe("store industry module firewall", () => {
  beforeEach(() => queryRaw.mockReset());

  it("allows Steamfoot actions only for a STEAMFOOT store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "STEAMFOOT" }]);
    const { requireSteamfootStore } = await import("@/lib/industry-module-server");
    await expect(requireSteamfootStore("store-steamfoot")).resolves.toBeUndefined();
  });

  it("rejects SPA actions for a Steamfoot store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "STEAMFOOT" }]);
    const { requireSpaStore } = await import("@/lib/industry-module-server");
    await expect(requireSpaStore("store-steamfoot")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects Steamfoot actions for a SPA store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "SPA" }]);
    const { requireSteamfootStore } = await import("@/lib/industry-module-server");
    await expect(requireSteamfootStore("store-spa")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("fails closed when the store does not exist", async () => {
    queryRaw.mockResolvedValue([]);
    const { getStoreIndustryModule } = await import("@/lib/industry-module-server");
    await expect(getStoreIndustryModule("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
