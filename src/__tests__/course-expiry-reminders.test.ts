import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>Object.fromEntries(["settings","store","cards","people","feature","plan","limit","preview","recipient","route","push","central","raw","setting","existing","upsert","update","updateMany","count"].map(k=>[k,vi.fn()])));
vi.mock("@/lib/db",()=>({prisma:{store:{findFirst:m.store},messageTemplate:{findMany:m.settings},customer:{findMany:m.people},messageLog:{upsert:m.upsert,updateMany:m.updateMany},$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,messageTemplate:{findFirst:m.setting},messageLog:{findUnique:m.existing,upsert:m.upsert,update:m.update,count:m.count}})}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointCard:{findMany:m.cards}}}));
vi.mock("@/lib/base-url",()=>({deriveBaseUrl:()=>"https://example.test"}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.plan}));
vi.mock("@/lib/usage-gate",()=>({checkReminderSendLimit:m.limit}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:m.preview}));
vi.mock("@/lib/line",()=>({pushMessage:m.push,pushSteamButlerMessage:m.central}));
vi.mock("@/server/services/central-line-recipient-loader",()=>({resolveCentralLineRecipientForCustomer:m.recipient}));
vi.mock("@/server/services/verified-reminder-line-route",()=>({resolveVerifiedReminderLineRoute:m.route}));
import {getCourseExpiryCandidates,runCourseExpiryReminders} from "@/server/services/course-expiry-reminders";
const now=new Date("2026-09-17T18:00:00+08:00");
const card={id:"card",storeId:"s",nameSnapshot:"點數方案",unit:"POINT",remaining:5,expiresAt:new Date("2026-10-01T23:59:59+08:00"),members:[{customerId:"A"},{customerId:"B"}],bookings:[{pointCost:3}]};
beforeEach(()=>{
 vi.resetAllMocks();m.settings.mockResolvedValue([{id:"course-expiry-reminder-enabled:s",store:{id:"s",slug:"test"}}]);m.store.mockResolvedValue({id:"s"});m.cards.mockResolvedValue([card]);m.people.mockResolvedValue([{id:"B",name:"B",lineLinkStatus:"LINKED",lineUserId:"b"}]);m.feature.mockResolvedValue(true);m.limit.mockReturnValue({allowed:true});m.preview.mockReturnValue(false);m.raw.mockResolvedValue([{remaining:5,held:3}]);m.setting.mockResolvedValue({id:"setting"});m.existing.mockResolvedValue(null);m.count.mockResolvedValue(0);m.route.mockResolvedValue({status:"READY",channel:"STORE",recipientLineUserId:"verified-b"});m.push.mockResolvedValue({success:true});
});
it("uses Taipei day bounds, course scope and reserved quota, excluding other modules",async()=>{
 expect(await getCourseExpiryCandidates("s",now)).toMatchObject([{days:14,held:3,date:"2026-10-01"}]);
 expect(m.cards).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",closedAt:null,OR:[{expiresAt:{gte:new Date("2026-09-30T16:00:00Z"),lte:new Date("2026-10-01T15:59:59.999Z")}},{expiresAt:{gte:new Date("2026-09-23T16:00:00Z"),lte:new Date("2026-09-24T15:59:59.999Z")}}]})}));
 m.store.mockResolvedValue(null);expect(await getCourseExpiryCandidates("other",now)).toEqual([]);expect(m.cards).toHaveBeenCalledTimes(1);
});
it("does not notify fully held or out-of-phase cards",async()=>{
 m.cards.mockResolvedValue([{...card,remaining:3},{...card,expiresAt:new Date("2026-10-02T12:00:00+08:00")}]);expect(await getCourseExpiryCandidates("s",now)).toEqual([]);
});
it("uses authorized same-store members, available points and course plan deep link",async()=>{
 expect(await runCourseExpiryReminders(now,"s")).toMatchObject({sent:1});
 expect(m.people).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",id:{in:["A","B"]},mergedIntoCustomerId:null})}));
 expect(m.recipient).toHaveBeenCalledWith("B","s");const call=m.push.mock.calls[0];expect(call[1]).toBe("verified-b");expect(JSON.stringify(call[2])).toContain("view=plans");expect(JSON.stringify(call[2])).toContain("2 點");expect(JSON.stringify(call[2])).toContain("共卡成員共用同一額度");expect(call[3]).toMatch(/^[a-f0-9-]{36}$/);
 await runCourseExpiryReminders(now);expect(m.push.mock.calls[1][3]).toBe(call[3]);
 expect(m.upsert.mock.calls[0][0].create).toMatchObject({storeId:"s",customerId:"B",courseCardId:"card"});
});
it.each(["sent","disabled","closed-or-unlinked","all-held"])("rechecks %s before sending",async scenario=>{
 if(scenario==="sent")m.existing.mockResolvedValue({status:"SENT"});
 if(scenario==="disabled")m.setting.mockResolvedValue(null);
 if(scenario==="closed-or-unlinked")m.raw.mockResolvedValueOnce([{}]).mockResolvedValueOnce([]);
 if(scenario==="all-held")m.raw.mockResolvedValue([{remaining:3,held:3}]);
 expect(await runCourseExpiryReminders(now)).toMatchObject({sent:0,skipped:1});expect(m.push).not.toHaveBeenCalled();
});
it("records preview suppression without resolving or sending LINE",async()=>{
 m.preview.mockReturnValue(true);expect(await runCourseExpiryReminders(now)).toMatchObject({skipped:1});expect(m.recipient).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SKIPPED"})}));
});
it("preserves feature, monthly quota and verified identity requirements",async()=>{
 m.feature.mockResolvedValue(false);await runCourseExpiryReminders(now);expect(m.cards).not.toHaveBeenCalled();m.feature.mockResolvedValue(true);m.limit.mockReturnValue({allowed:false});await runCourseExpiryReminders(now);expect(m.recipient).not.toHaveBeenCalled();m.limit.mockReturnValue({allowed:true});m.route.mockResolvedValue({status:"BLOCKED",reason:"unlinked"});await runCourseExpiryReminders(now);expect(m.push).not.toHaveBeenCalled();
});
it("does not use unverified legacy LINE id",async()=>{
 m.people.mockResolvedValue([{id:"B",name:"B",lineUserId:"old",lineLinkStatus:"PENDING"}]);await runCourseExpiryReminders(now);expect(m.route).toHaveBeenCalledWith("s",null,undefined);
});
it("retains uncertain delivery evidence without overwriting concurrent SENT",async()=>{
 m.push.mockRejectedValue(new Error("timeout"));expect(await runCourseExpiryReminders(now)).toMatchObject({failed:1,sent:0});expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",status:{not:"SENT"}})}));
});
