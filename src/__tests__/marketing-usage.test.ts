import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), path: vi.fn(), tag: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidatePath: mocks.path,
  revalidateTag: mocks.tag,
}));
import { calculateMarketingUsage, getMarketingUsage } from "@/lib/marketing-usage-server";
import { GET } from "@/app/api/cron/marketing-usage/route";
import { verifiedMarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ stores: BigInt(3), customers: BigInt(328), completed_people: BigInt(1631), reminders_sent: BigInt(641) }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("marketing usage daily refresh", () => {
  it("uses the Taiwan day boundary and serializable aggregate numbers", async () => {
    const result = await calculateMarketingUsage(new Date("2026-10-02T17:00:00Z"));
    expect(result).toEqual({ stores: 3, customers: 328, completedPeople: 1631, remindersSent: 641, asOf: "2026-10-02" });
    const bindings = mocks.query.mock.calls[0].slice(1);
    expect(bindings).toEqual(["2026-10-03", "2026-10-03", "2026-10-03", new Date("2026-10-02T16:00:00Z"), "2026-10-03", new Date("2026-10-02T16:00:00Z"), new Date("2026-10-02T16:00:00Z")]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("does not advance the cutoff before Taiwan midnight", async () => {
    expect((await calculateMarketingUsage(new Date("2026-10-02T15:59:59Z"))).asOf).toBe("2026-10-01");
  });
  it("rejects invalid counts instead of publishing or caching them", async () => {
    mocks.query.mockResolvedValue([{ stores: BigInt(3), customers: BigInt(-1), completed_people: BigInt(1631), reminders_sent: BigInt(641) }]);
    await expect(calculateMarketingUsage()).rejects.toThrow("Invalid marketing usage aggregate");
  });
  it.each([null, undefined, -1, NaN, Number.MAX_SAFE_INTEGER + 1])("does not turn an unknown or invalid reminder count (%s) into zero", async (value) => {
    mocks.query.mockResolvedValue([{ stores: BigInt(3), customers: BigInt(328), completed_people: BigInt(1631), reminders_sent: value }]);
    await expect(calculateMarketingUsage()).rejects.toThrow("Invalid marketing usage aggregate");
  });
  it("keeps all fallback counts and their verified date together after a failed refresh", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.query.mockRejectedValue(new Error("unavailable"));
    const result = await getMarketingUsage();
    expect(result).toEqual(verifiedMarketingUsageSnapshot);
    expect(result.remindersSent).toBeGreaterThan(0);
  });
  it("does not query preview data", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await getMarketingUsage()).asOf).toBe("2026-10-07");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("keeps the verified date when a cold-cache query fails", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.query.mockRejectedValue(new Error("unavailable"));
    expect(await getMarketingUsage()).toEqual({ stores: 5, customers: 338, completedPeople: 1698, remindersSent: 641, asOf: "2026-10-07" });
  });
  it("rejects cron requests when the secret is absent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const result = await GET(new Request("https://example.com/api/cron/marketing-usage", { headers: { authorization: "Bearer undefined" } }));
    expect(result.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not invalidate the previous result when refresh fails", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-only-secret");
    mocks.query.mockRejectedValue(new Error("unavailable"));
    const result = await GET(new Request("https://example.com/api/cron/marketing-usage", { headers: { authorization: "Bearer test-only-secret" } }));
    expect(result.status).toBe(500);
    expect(mocks.tag).not.toHaveBeenCalled();
    expect(mocks.path).not.toHaveBeenCalled();
  });
  it("refreshes only after an authorized successful production query", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-only-secret");
    const result = await GET(new Request("https://example.com/api/cron/marketing-usage", { headers: { authorization: "Bearer test-only-secret" } }));
    expect(result.status).toBe(200);
    expect(mocks.tag).toHaveBeenCalledWith("marketing-usage-v4", "max");
    expect(mocks.path).toHaveBeenCalledWith("/pricing/business");
    expect(await result.json()).not.toHaveProperty("customers");
  });
});
