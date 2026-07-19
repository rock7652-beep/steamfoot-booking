import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ runtime: vi.fn(), create: vi.fn(), cleanup: vi.fn() }));

vi.mock("@/server/services/line-rebind-smoke-fixture", () => ({
  createPr2SmokeFixture: h.create,
  cleanupPr2SmokeFixture: h.cleanup,
}));
vi.mock("@/server/services/pr2-preview-smoke-runtime", () => ({ assertPr2PreviewSmokeRuntime: h.runtime }));

import { GET as create } from "@/app/api/internal/pr2-smoke-fixture/create/route";
import { GET as cleanup } from "@/app/api/internal/pr2-smoke-fixture/cleanup/route";

describe("temporary PR-2 Preview smoke routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.runtime.mockReset();
    h.runtime.mockImplementation(() => undefined);
    h.create.mockResolvedValue({ customerId: "customer-secret-id", requestId: "request-secret-id", expiresAt: "2099-01-01T00:00:00.000Z" });
    h.cleanup.mockResolvedValue({ removed: true });
  });

  it("rejects non-Preview and production runtime before fixture access", async () => {
    h.runtime.mockImplementation(() => { throw new Error("runtime"); });
    const response = await create(new Request("https://preview.example/api/internal/pr2-smoke-fixture/create"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("ignores arbitrary query data and creates only the fixed fixture", async () => {
    const response = await create(new Request("https://preview.example/api/internal/pr2-smoke-fixture/create?customerId=attacker&storeId=other"));
    expect(response.status).toBe(200);
    expect(h.create).toHaveBeenCalledWith();
    expect(await response.json()).toEqual({ status: "created", customerId: "custom…t-id", requestId: "reques…t-id", expiresAt: "2099-01-01T00:00:00.000Z" });
  });

  it("fails closed for a duplicate create without exposing implementation details", async () => {
    h.create.mockRejectedValue(new Error("PR2_SMOKE_FIXTURE_ALREADY_EXISTS ciphertext-secret"));
    const response = await create(new Request("https://preview.example/api/internal/pr2-smoke-fixture/create"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("cleans the fixed fixture and fails closed on inconsistent fixture data", async () => {
    await expect(cleanup(new Request("https://preview.example/api/internal/pr2-smoke-fixture/cleanup"))).resolves.toMatchObject({ status: 200 });
    expect(h.cleanup).toHaveBeenCalledWith();
    h.cleanup.mockRejectedValue(new Error("PR2_SMOKE_FIXTURE_INCONSISTENT"));
    const response = await cleanup(new Request("https://preview.example/api/internal/pr2-smoke-fixture/cleanup"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("does not call external LINE endpoints", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await create(new Request("https://preview.example/api/internal/pr2-smoke-fixture/create"));
    await cleanup(new Request("https://preview.example/api/internal/pr2-smoke-fixture/cleanup"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
