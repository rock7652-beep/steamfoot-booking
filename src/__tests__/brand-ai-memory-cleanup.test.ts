import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ purge: vi.fn(), blocked: vi.fn() }));
vi.mock("@/server/services/brand-ai-memory", () => ({
  purgeExpiredBrandMemory: mocks.purge,
}));
vi.mock("@/lib/runtime-env", () => ({
  isPreviewExternalIntegrationBlocked: mocks.blocked,
}));
import { GET } from "@/app/api/cron/brand-ai-memory-cleanup/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("rejects missing/wrong cron credentials and unknown deployments before DB access", async () => {
  vi.stubEnv("CRON_SECRET", "local-only");
  mocks.blocked.mockReturnValue(false);
  expect((await GET(new Request("https://example.invalid"))).status).toBe(401);
  mocks.blocked.mockReturnValue(true);
  expect(
    (
      await GET(
        new Request("https://example.invalid", {
          headers: { authorization: "Bearer local-only" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.purge).not.toHaveBeenCalled();
});
it("purges when AI is disabled and returns only a count", async () => {
  vi.stubEnv("CRON_SECRET", "local-only");
  vi.stubEnv("BRAND_AI_ENABLED", "0");
  mocks.blocked.mockReturnValue(false);
  mocks.purge.mockResolvedValue(2);
  const response = await GET(
    new Request("https://example.invalid", {
      headers: { authorization: "Bearer local-only" },
    }),
  );
  expect(await response.json()).toEqual({ deleted: 2 });
});
