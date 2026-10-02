import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({findMany:vi.fn(),updateMany:vi.fn(),notify:vi.fn()}));
vi.mock("@/lib/db", () => ({prisma:{trialApplication:m}}));
vi.mock("@/server/services/trial-application-notification", () => ({notifyTrialApplication:m.notify}));
import { GET } from "@/app/api/cron/trial-application-notifications/route";
const request = () => new Request("https://example.invalid/api/cron/trial-application-notifications",{headers:{authorization:"Bearer test-secret"}});
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET","test-secret"); vi.stubEnv("VERCEL_ENV","production"); vi.stubEnv("TRIAL_INTAKE_WEBHOOK_URL","https://script.google.com/macros/s/test/exec");
  m.findMany.mockResolvedValue([{id:"test-id",revision:2,notificationStatus:"FAILED",updatedAt:new Date("2026-10-02T00:00:00Z")}]);
  m.updateMany.mockResolvedValue({count:1}); m.notify.mockResolvedValue("SENT");
});
afterEach(() => vi.unstubAllEnvs());
it("requires authentication before data access", async () => {
  expect((await GET(new Request("https://example.invalid"))).status).toBe(401);
  expect(m.findMany).not.toHaveBeenCalled();
});
it("never accesses production receipt data or sends on Preview", async () => {
  vi.stubEnv("VERCEL_ENV","preview");
  expect(await (await GET(request())).json()).toEqual({skipped:"preview"});
  expect(m.findMany).not.toHaveBeenCalled();
});
it("claims stale failure and only updates its matching revision", async () => {
  expect(await (await GET(request())).json()).toEqual({sent:1,failed:0});
  expect(m.findMany.mock.calls[0][0].take).toBe(3);
  expect(m.updateMany.mock.calls[0][0].where).toMatchObject({revision:2,notificationStatus:"FAILED"});
  expect(m.updateMany.mock.calls[1][0].where).toEqual({id:"test-id",revision:2,notificationStatus:"SENDING"});
});
it("does not send after another worker claims a record", async () => {
  m.updateMany.mockResolvedValue({count:0});
  expect(await (await GET(request())).json()).toEqual({sent:0,failed:0});
  expect(m.notify).not.toHaveBeenCalled();
});
