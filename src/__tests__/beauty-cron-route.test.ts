import { afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
}));
vi.mock("@/server/beauty/notifications", () => ({
  runBeautyNotifications: m.run,
}));
import { GET } from "@/app/api/cron/beauty-notifications/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("rejects when cron authentication is not configured", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect(
    (
      await GET(
        new NextRequest("http://localhost/api/cron/beauty-notifications"),
      )
    ).status,
  ).toBe(401);
  expect(m.run).not.toHaveBeenCalled();
});
it("rejects a missing or wrong bearer before touching the outbox", async () => {
  vi.stubEnv("CRON_SECRET", "synthetic-qa");
  expect(
    (
      await GET(
        new NextRequest("http://localhost/api/cron/beauty-notifications", {
          headers: { authorization: "Bearer wrong" },
        }),
      )
    ).status,
  ).toBe(401);
  expect(m.run).not.toHaveBeenCalled();
});
it("permits only the configured cron identity to invoke the gated runner", async () => {
  vi.stubEnv("CRON_SECRET", "synthetic-qa");
  expect(
    (
      await GET(
        new NextRequest("http://localhost/api/cron/beauty-notifications", {
          headers: { authorization: "Bearer synthetic-qa" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(m.run).toHaveBeenCalledOnce();
});
