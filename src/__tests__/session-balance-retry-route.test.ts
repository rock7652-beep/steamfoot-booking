import { beforeEach, afterEach, expect, it, vi } from "vitest";
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-balance-notifications", () => ({ retrySessionBalanceNotifications: retry }));
import { GET } from "@/app/api/cron/session-balance-retry/route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "test-secret"); vi.stubEnv("VERCEL_ENV", "production"); });
afterEach(() => vi.unstubAllEnvs());
const request = (auth = "Bearer test-secret") => new Request("https://example.test/api/cron/session-balance-retry", { headers: { authorization: auth } });
it("requires authentication", async () => {
  expect((await GET(request("wrong"))).status).toBe(401);
  expect(retry).not.toHaveBeenCalled();
});
it("fails closed when secret is absent", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(request("Bearer undefined"))).status).toBe(401);
});
it("blocks preview even with valid authentication", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await GET(request())).status).toBe(403);
  expect(retry).not.toHaveBeenCalled();
});
it("runs bounded recovery in production", async () => {
  retry.mockResolvedValue({ processed: 2 });
  expect(await (await GET(request())).json()).toEqual({ processed: 2 });
});
