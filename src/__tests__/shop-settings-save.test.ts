import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),course:vi.fn(),transaction:vi.fn(),find:vi.fn(),create:vi.fn(),update:vi.fn(),ensure:vi.fn(),tag:vi.fn(),path:vi.fn()}));
vi.mock("next/cache",()=>({revalidateTag:m.tag,revalidatePath:m.path}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.course}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/server/services/trial-plan",()=>({ensureTrialPlan:m.ensure}));
vi.mock("@/lib/shop-config",()=>({TRIAL_DEFAULTS:{trialEnabled:true,trialDefaultPrice:499,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:3000}}));
import {saveShopSettings} from "@/server/services/shop-settings-save";
import {paymentSettingsRevision,trialSettingsRevision} from "@/lib/shop-settings-save";
const payment={bankName:null,bankCode:null,bankAccountNumber:null,lineOfficialId:null,lineOfficialUrl:null};
const trial={trialEnabled:true,trialDefaultPrice:499,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:3000};
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
let config:Record<string,unknown>|null;
const tx={$queryRaw:vi.fn(),shopConfig:{findUnique:m.find,create:m.create,updateMany:m.update}};
beforeEach(()=>{vi.resetAllMocks();config=null;m.permission.mockResolvedValue({id:"user"});m.store.mockResolvedValue("store");m.module.mockResolvedValue("steamfoot");m.course.mockResolvedValue({storeId:"store"});m.find.mockImplementation(async()=>config);m.create.mockImplementation(async({data})=>config={...payment,...trial,...data,updatedAt:new Date()});m.update.mockImplementation(async({data})=>{config={...config,...data};return {count:1};});m.transaction.mockImplementation(async work=>work(tx));});
it("confirms saved payment and an already applied retry without another write",async()=>{
 const input={kind:"PAYMENT",values:{...payment,bankName:"銀行",bankAccountNumber:"123"},expectedRevision:paymentSettingsRevision(payment),...receipt};const first=await saveShopSettings(input);
 expect(first).toMatchObject({success:true,data:{values:{bankName:"銀行"}}});expect(await saveShopSettings(input)).toEqual(first);expect(m.create).toHaveBeenCalledTimes(1);expect(m.update).not.toHaveBeenCalled();
 expect(m.permission).toHaveBeenCalledWith("plans.edit");expect(m.tag).toHaveBeenCalledWith("shop-config",{expire:0});
 expect((await saveShopSettings({...input,values:{...input.values,bankName:"過期修改"}})).success).toBe(false);
});
it("clears every payment field while preserving unrelated trial settings",async()=>{
 config={...payment,...trial,bankName:"銀行",bankAccountNumber:"123",lineOfficialId:"@shop",updatedAt:new Date()};
 expect(await saveShopSettings({kind:"PAYMENT",values:payment,expectedRevision:paymentSettingsRevision(config),...receipt})).toMatchObject({success:true,data:{values:payment}});
 expect(m.update.mock.calls[0][0].data).toEqual(payment);expect(config!.trialDefaultPrice).toBe(499);
});
it("writes trial configuration and its canonical plan in one transaction; course uses its own guard",async()=>{
 const input={kind:"TRIAL",values:{...trial,trialDefaultPrice:800},expectedRevision:trialSettingsRevision(trial),...receipt};expect((await saveShopSettings(input)).success).toBe(true);
 expect(m.ensure).toHaveBeenCalledWith("store",800,tx);expect(m.permission).toHaveBeenCalledWith("trial.manage");
 m.ensure.mockClear();m.module.mockResolvedValue("course");expect((await saveShopSettings(input)).success).toBe(true);expect(m.course).toHaveBeenCalledWith("trial.manage");expect(m.ensure).not.toHaveBeenCalled();
});
it("rejects changed stores, denied rights and conflicting concurrent writes",async()=>{
 const input={kind:"PAYMENT",values:{...payment,bankName:"銀行"},expectedRevision:paymentSettingsRevision(payment),...receipt};
 expect((await saveShopSettings({...input,expectedStoreId:"other"})).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 m.permission.mockRejectedValueOnce(new Error("denied"));expect((await saveShopSettings(input)).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
 config={...payment,...trial,updatedAt:new Date()};m.update.mockResolvedValueOnce({count:0});expect((await saveShopSettings(input)).success).toBe(false);
});
it("does not misreport a committed save when cache invalidation fails",async()=>{
 m.tag.mockImplementation(()=>{throw new Error("cache failure");});expect(await saveShopSettings({kind:"TRIAL",values:{...trial,trialDefaultPrice:800},expectedRevision:trialSettingsRevision(trial),...receipt})).toMatchObject({success:true,syncWarning:true});
});
