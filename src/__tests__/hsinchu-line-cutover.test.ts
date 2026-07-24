import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getLineBotInfo: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/line", () => ({ getLineBotInfo: h.getLineBotInfo }));
vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findFirst: h.findFirst,
      update: h.update,
      findMany: h.findMany,
    },
  },
}));
vi.mock("@/lib/session", () => ({ requireAdminSession: h.requireAdminSession }));

describe("Hsinchu LINE one-time cutover", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
    h.getLineBotInfo.mockResolvedValue({
      ok: true,
      data: { displayName: "以斯帖蒸足坊", basicId: "@059rrqpw", userId: "Unew-hsinchu" },
    });
    h.findFirst.mockResolvedValue(null);
    h.update.mockResolvedValue({ id: "store-hsinchu" });
    h.requireAdminSession.mockResolvedValue({ id: "admin" });
    h.findMany.mockResolvedValue([
      { id: "store-hsinchu", lineDestination: "Unew-hsinchu" },
      { id: "store-zhubei", lineDestination: "Uzhubei" },
      { id: "store-taichung", lineDestination: "Utaichung" },
    ]);
  });

  it("derives the destination from LINE and updates only store-hsinchu", async () => {
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(h.getLineBotInfo).toHaveBeenCalledWith("store-hsinchu");
    expect(h.update).toHaveBeenCalledWith({
      where: { id: "store-hsinchu" },
      data: { lineDestination: "Unew-hsinchu" },
      select: { id: true },
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
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuses unauthenticated callers", async () => {
    h.requireAdminSession.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(401);
    expect(h.getLineBotInfo).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuses a destination already assigned to another store", async () => {
    h.findFirst.mockResolvedValue({ id: "store-zhubei" });
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("is unavailable outside Production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { POST } = await import("@/app/api/internal/hsinchu-line-cutover/route");
    const response = await POST();

    expect(response.status).toBe(404);
    expect(h.getLineBotInfo).not.toHaveBeenCalled();
  });
});
