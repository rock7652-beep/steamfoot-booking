import { afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
  care: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
  managers: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: 0 }),
  digital: vi.fn().mockResolvedValue({ recorded: 0, failed: 0 }),
}));
vi.mock("@/server/beauty/notifications", () => ({
  runBeautyNotifications: m.run,
}));
vi.mock("@/server/beauty/care-reminders",()=>({runBeautyCareReminders:m.care}));
vi.mock("@/server/beauty/manager-notifications",()=>({runBeautyManagerReminders:m.managers}));
vi.mock("@/server/beauty/digital-manager-reminders",()=>({runBeautyDigitalManagerReminders:m.digital}));
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
  expect(m.care).not.toHaveBeenCalled();
  expect(m.managers).not.toHaveBeenCalled();
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
  expect(m.care).not.toHaveBeenCalled();
  expect(m.managers).not.toHaveBeenCalled();
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
  expect(m.care).toHaveBeenCalledOnce();
  expect(m.managers).toHaveBeenCalledOnce();
  expect(m.digital).toHaveBeenCalledOnce();
});

it("returns all three runner totals without losing separate care and manager outcomes",async()=>{
 vi.stubEnv("CRON_SECRET","synthetic-qa");
 m.run.mockResolvedValueOnce({sent:1,failed:2,skipped:3});
 m.care.mockResolvedValueOnce({sent:4,failed:5,skipped:6});
 m.managers.mockResolvedValueOnce({sent:7,failed:8,skipped:9});
 const response=await GET(new NextRequest("http://localhost/api/cron/beauty-notifications",{headers:{authorization:"Bearer synthetic-qa"}}));
 expect(await response.json()).toEqual({sent:12,failed:15,skipped:18,care:{sent:4,failed:5,skipped:6},managers:{sent:7,failed:8,skipped:9},digitalManager:{recorded:0,failed:0}});
});
