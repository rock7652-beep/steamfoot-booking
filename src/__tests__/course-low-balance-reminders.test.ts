import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>Object.fromEntries(["settings","store","cards","people","feature","plan","limit","preview","recipient","route","push","central","raw","setting","existing","upsert","update","updateMany","count"].map(k=>[k,vi.fn()])));
vi.mock("@/lib/db",()=>({prisma:{store:{findMany:m.store},messageTemplate:{findMany:m.settings,upsert:m.setting},customer:{findMany:m.people},messageLog:{upsert:m.upsert,updateMany:m.updateMany},$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,messageTemplate:{upsert:m.setting},messageLog:{findUnique:m.existing,upsert:m.upsert,update:m.update,count:m.count}})}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointCard:{findMany:m.cards}}}));
vi.mock("@/lib/base-url",()=>({deriveBaseUrl:()=>"https://example.test"}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.plan}));
vi.mock("@/lib/usage-gate",()=>({checkReminderSendLimit:m.limit}));
vi.mock("@/lib/runtime-env",()=>({isPreviewExternalIntegrationBlocked:m.preview}));
vi.mock("@/lib/line",()=>({pushMessage:m.push,pushSteamButlerMessage:m.central}));
vi.mock("@/server/services/central-line-recipient-loader",()=>({resolveCentralLineRecipientForCustomer:m.recipient}));
vi.mock("@/server/services/verified-reminder-line-route",()=>({resolveVerifiedReminderLineRoute:m.route}));
import {runCourseLowBalanceReminders,courseLowBalanceMessages} from "@/server/services/course-low-balance-reminders";
import {courseCardIsLow,courseLowBalanceSchema,courseLowBalanceBody} from "@/lib/course-low-balance";
const now=new Date("2026-09-17T18:00:00+08:00");
const card={id:"card",storeId:"s",nameSnapshot:"點數方案",unit:"POINT",remaining:5,closedAt:null,expiresAt:new Date("2026-10-01T23:59:59+08:00"),plan:{lowBalanceEnabled:true,lowBalanceThreshold:2},members:[{customerId:"A"},{customerId:"B"}],bookings:[{pointCost:3}]};
beforeEach(()=>{
 vi.resetAllMocks();m.store.mockResolvedValue([{id:"s",slug:"test"}]);m.cards.mockResolvedValue([card]);m.people.mockResolvedValue([{id:"B",lineLinkStatus:"LINKED",lineUserId:"b"}]);m.feature.mockResolvedValue(true);m.limit.mockReturnValue({allowed:true});m.preview.mockReturnValue(false);m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes("CourseBalanceReminderPreference")?[{stoppedAt:null}]:[{remaining:5,held:3,unit:"POINT",nameSnapshot:"點數方案"}]);m.existing.mockResolvedValue(null);m.count.mockResolvedValue(0);m.route.mockResolvedValue({status:"READY",channel:"STORE",recipientLineUserId:"verified-b"});m.push.mockResolvedValue({success:true});
});
it("never auto-enables without a configured threshold",()=>{
 expect(courseLowBalanceSchema.safeParse({planId:"p",enabled:true,threshold:null}).success).toBe(false);
 expect(courseLowBalanceSchema.safeParse({planId:"p",enabled:false,threshold:null}).success).toBe(true);
 for(const threshold of [-1,1.5]) expect(courseLowBalanceSchema.safeParse({planId:"p",enabled:true,threshold}).success).toBe(false);
});
it("compares each card's available quota, excluding expired and closed cards",()=>{
 const input={enabled:true,threshold:2,remaining:5,held:3,closed:false,expiresAt:card.expiresAt};
 expect(courseCardIsLow(input,now)).toBe(true);
 for(const diff of [{held:2},{enabled:false},{threshold:null},{closed:true},{expiresAt:now}]) expect(courseCardIsLow({...input,...diff},now)).toBe(false);
 expect(courseLowBalanceBody("堂數",5,3,"SESSION")).toContain("剩餘 5 堂，已預約占用 3 堂，可用 2 堂");
});
it("does not add another applicable or unrelated card to suppress the low card",async()=>{
 m.cards.mockResolvedValue([card,{...card,id:"other",remaining:100,bookings:[]}]);
 expect(await runCourseLowBalanceReminders(now,"s")).toMatchObject({sent:1});
 expect(m.store).toHaveBeenCalledWith(expect.objectContaining({where:{industryModule:"COURSE",id:"s"}}));
 expect(m.people).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"s",id:{in:["A","B"]}})}));
 expect(JSON.stringify(m.push.mock.calls[0][2])).toContain("剩餘 5 點，已預約占用 3 點，可用 2 點");
 expect(JSON.stringify(m.push.mock.calls[0][2])).toContain("/s/test/book/reminders");
 const key=m.push.mock.calls[0][3];await runCourseLowBalanceReminders(now,"s");expect(m.push.mock.calls[1][3]).toBe(key);
});
it("does not resend a successful card reminder after cancellation/rebooking or threshold changes",async()=>{
 m.existing.mockResolvedValue({status:"SENT"});await runCourseLowBalanceReminders(now,"s");expect(m.push).not.toHaveBeenCalled();
});
it("rechecks card/plan/member under the same transaction lock before sending",async()=>{
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes('JOIN "CoursePointPlan"')?[]:[{}]);
 expect(await runCourseLowBalanceReminders(now,"s")).toMatchObject({skipped:1});expect(m.push).not.toHaveBeenCalled();expect(m.raw.mock.calls[0][0].join("")).toContain("FOR UPDATE");
});
it("honors individual opt-out and does not mistake held quota for consumption",async()=>{
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes("CourseBalanceReminderPreference")?[{stoppedAt:now}]:[{remaining:5,held:3,unit:"POINT",nameSnapshot:"卡"}]);
 await runCourseLowBalanceReminders(now,"s");expect(m.push).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:{status:"SKIPPED",errorMessage:"顧客已停止接收此類訊息"}}));
 expect(JSON.stringify(courseLowBalanceMessages("占用尚未正式使用額度","test"))).not.toContain("已使用完畢");
});
it("retains preview suppression and plan send quotas",async()=>{
 m.preview.mockReturnValue(true);await runCourseLowBalanceReminders(now,"s");expect(m.push).not.toHaveBeenCalled();expect(m.recipient).not.toHaveBeenCalled();m.preview.mockReturnValue(false);m.limit.mockReturnValue({allowed:false});await runCourseLowBalanceReminders(now,"s");expect(m.push).not.toHaveBeenCalled();
});
it("never sends on unverifiable identity and preserves a stable key on uncertain results",async()=>{
 m.route.mockResolvedValue({status:"BLOCKED",reason:"unknown"});await runCourseLowBalanceReminders(now,"s");expect(m.push).not.toHaveBeenCalled();m.route.mockResolvedValue({status:"READY",channel:"STORE",recipientLineUserId:"verified-b"});m.push.mockRejectedValue(new Error("timeout"));expect(await runCourseLowBalanceReminders(now,"s")).toMatchObject({failed:1});expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:{not:"SENT"}})}));
});

it("links directly to the course plan and authenticated preference pages",()=>{
 const message=JSON.stringify(courseLowBalanceMessages("test","shop"));
 expect(message).toContain("https://example.test/s/shop/book?view=plans");
 expect(message).toContain("https://example.test/s/shop/book/reminders");
});
