import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getLineBotInfo: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/line", () => ({ getLineBotInfo: h.getLineBotInfo }));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: h.findUnique,
      findFirst: h.findFirst,
      updateMany: h.updateMany,
      findMany: h.findMany,
    },
  },
}));

describe("Hsinchu LINE one-time cutover", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
    h.getLineBotInfo.mockResolvedValue({
      ok: true,
      data: { displayName: "以斯帖蒸足坊", basicId: "@059rrqpw", userId: "Unew-hsinchu" },
    });
    h.findUnique.mockResolvedValue({
      lineDestination: "Ufa6a3615f9acb1c52437b7ddf0eba25c",
    });
    h.findFirst.mockResolvedValue(null);
    h.updateMany.mockResolvedValue({ count: 1 });
    h.findMany.mockResolvedValue([
      { id: "store-hsinchu", lineDestination: "Unew-hsinchu" },
      { id: "e182e256-98ca-4c78-970b-d4b118066c51", lineDestination: "Uzhubei" },
      { id: "store-taichung", lineDestination: "Utaichung" },
    ]);
  });

  it("derives the destination from LINE and updates only store-hsinchu", async () => {
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(h.getLineBotInfo).toHaveBeenCalledWith("store-hsinchu");
    expect(h.updateMany).toHaveBeenCalledWith({
      where: {
        id: "store-hsinchu",
        lineDestination: "Ufa6a3615f9acb1c52437b7ddf0eba25c",
      },
      data: { lineDestination: "Unew-hsinchu" },
    });
    expect(await response.json()).toMatchObject({ ok: true, basicId: "@059rrqpw" });
  });

  it("refuses a token belonging to a different LINE account", async () => {
    h.getLineBotInfo.mockResolvedValue({
      ok: true,
      data: { displayName: "wrong", basicId: "@788umzem", userId: "Uwrong" },
    });
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(409);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("is permanently unavailable after the old destination has changed", async () => {
    h.findUnique.mockResolvedValue({ lineDestination: "Ualready-cut-over" });
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(410);
    expect(h.getLineBotInfo).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a destination already assigned to another store", async () => {
    h.findFirst.mockResolvedValue({ id: "store-zhubei" });
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(409);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("is unavailable outside Production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(404);
    expect(h.getLineBotInfo).not.toHaveBeenCalled();
  });
});
