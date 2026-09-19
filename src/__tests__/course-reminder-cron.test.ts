import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({steam:vi.fn(),course:vi.fn(),finish:vi.fn(),gate:vi.fn()}));
vi.mock("@/server/reminder-engine",()=>({runReminders:m.steam}));
vi.mock("@/server/services/course-reminders",()=>({runCourseReminders:m.course}));
vi.mock("@/lib/db",()=>({prisma:{cronRunLog:{create:async()=>({id:"run"}),update:m.finish},errorLog:{deleteMany:async()=>({count:0})}}}));
vi.mock("@/server/queries/report-compute",()=>({computeStoreSummary:vi.fn(),computeRevenueByCategory:vi.fn()}));
vi.mock("@/server/queries/report-snapshot",()=>({upsertReportSnapshot:vi.fn()}));
vi.mock("@/lib/store",()=>({getAllActiveStoreIds:async()=>[]}));
vi.mock("@/server/services/plan-expiry-notifications",()=>({runPlanExpiryNotifications:async()=>({sent:0,skipped:0,failed:0})}));
vi.mock("@/server/actions/upgrade-request",()=>({processScheduledDowngrades:async()=>({processed:0,errors:[]}),processExpiredTrials:async()=>({processed:0,errors:[]})}));
vi.mock("@/server/reminder-cron-retry",async importOriginal=>({...await importOriginal<object>(),decideReminderRetry:m.gate}));
import {GET} from "@/app/api/cron/reminders/route";
import {GET as RETRY} from "@/app/api/cron/reminders-retry/route";
const request=()=>new NextRequest("https://example.test/api/cron/reminders",{headers:{authorization:"Bearer test-secret"}});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("CRON_SECRET","test-secret");m.steam.mockResolvedValue({total:0,sent:0,skipped:0,failed:0,details:[]});m.course.mockResolvedValue({total:2,sent:1,skipped:0,failed:1});m.gate.mockResolvedValue({action:"retry",reason:"PRIOR_FAILED",retryOf:"old"});});
afterEach(()=>vi.unstubAllEnvs());
it("reports individual course failure as PARTIAL with combined totals, preserving normal HTTP 200",async()=>{
 expect((await GET(request())).status).toBe(200);expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PARTIAL",bookingsScanned:2,sent:1,failed:1})}));
});
it("course batch exception produces FAILED and HTTP 500, not an empty successful cron",async()=>{
 m.course.mockRejectedValue(new Error("DB unavailable"));expect((await GET(request())).status).toBe(500);expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED"})}));
});
it("retry runs the course engine and includes its totals",async()=>{
 expect((await RETRY(request())).status).toBe(200);expect(m.course).toHaveBeenCalledTimes(1);expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PARTIAL",bookingsScanned:2})}));
});
it("rejects unauthenticated requests before either engine",async()=>{
 expect((await GET(new NextRequest("https://example.test"))).status).toBe(401);expect(m.course).not.toHaveBeenCalled();expect(m.steam).not.toHaveBeenCalled();
});
