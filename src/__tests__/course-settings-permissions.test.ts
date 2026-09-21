import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),execute:vi.fn(),rules:vi.fn(),bank:vi.fn(),revalidate:vi.fn(),writable:vi.fn()}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:m.writable}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfig:m.revalidate}));
vi.mock("@/server/actions/shop",()=>({updateShopBankInfo:m.bank}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
import {saveCourseSettings,saveCoursePaymentSettings,saveCourseSettingsSection} from "@/server/actions/course-settings";
import {AppError} from "@/lib/errors";
const input={name:"測試店",address:"測試地址",mapUrl:"",lineOfficialUrl:"",bookingLeadMinutes:0,cancellationLeadMinutes:30};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"store"});m.transaction.mockImplementation(async(_store,work)=>work({$executeRaw:m.execute,courseBookingRule:{upsert:m.rules}}));m.bank.mockResolvedValue({success:true,data:undefined});});
describe("course settings separates bank and operating permissions",()=>{
 it("keeps bank information untouched when saving only store and booking rules",async()=>{
  expect(await saveCourseSettings(input)).toMatchObject({success:true});expect(m.manager).toHaveBeenCalledExactlyOnceWith("business_hours.manage");expect(m.execute).toHaveBeenCalledTimes(2);
  expect(m.execute.mock.calls.some(call=>call[0].join("").includes('"bankName"'))).toBe(false);
  expect(m.rules).toHaveBeenCalledWith({where:{storeId:"store"},create:{storeId:"store",bookingLeadMinutes:0,cancellationLeadMinutes:30},update:{bookingLeadMinutes:0,cancellationLeadMinutes:30}});expect(m.revalidate).toHaveBeenCalled();
 });
 it("blocks legacy combined bank edits without plans.edit before any mutation",async()=>{
  m.manager.mockImplementation(async(permission)=>{if(permission==="plans.edit")throw new AppError("FORBIDDEN","付款設定無權限");return {storeId:"store"};});
  expect(await saveCourseSettings({...input,bankName:"銀行",bankCode:"000",bankAccountNumber:"123"})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 });
 it("rejects incomplete legacy bank fields instead of erasing omitted values",async()=>{
  expect(await saveCourseSettings({...input,bankName:"銀行"})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 });
 it("wraps the mature payment action in course write-store and active membership checks",async()=>{
  const bank={bankName:"銀行",bankCode:"000",bankAccountNumber:"123",lineOfficialUrl:null};expect(await saveCoursePaymentSettings(bank)).toMatchObject({success:true});expect(m.manager).toHaveBeenCalledWith("plans.edit");expect(m.bank).toHaveBeenCalledWith(bank);
  m.bank.mockClear();m.manager.mockRejectedValueOnce(new AppError("FORBIDDEN","非課程店或工作停用"));expect(await saveCoursePaymentSettings(bank)).toMatchObject({success:false});expect(m.bank).not.toHaveBeenCalled();
 });
});
describe("isolated course settings sections",()=>{
 it("updates bank columns only, ignoring cross-section input",async()=>{
  expect(await saveCourseSettingsSection({section:"payment",bankName:"銀行",bankCode:"123",bankAccountNumber:"001234",lineOfficialUrl:"https://stale.example",name:"舊名稱"})).toMatchObject({success:true});
  expect(m.manager).toHaveBeenCalledExactlyOnceWith("plans.edit");expect(m.writable).toHaveBeenCalledWith("store");expect(m.execute).toHaveBeenCalledTimes(1);expect(m.rules).not.toHaveBeenCalled();
  const sql=m.execute.mock.calls[0][0].join("");expect(sql).toContain('"bankAccountNumber"');expect(sql).not.toContain('"lineOfficialUrl"');expect(sql).not.toContain('"shopName"');
 });
 it("saves cutoffs without touching store or bank fields",async()=>{
  expect(await saveCourseSettingsSection({section:"booking",bookingLeadMinutes:30,cancellationLeadMinutes:60})).toMatchObject({success:true});expect(m.execute).not.toHaveBeenCalled();expect(m.manager).toHaveBeenCalledWith("business_hours.manage");expect(m.rules).toHaveBeenCalledWith({where:{storeId:"store"},create:{storeId:"store",bookingLeadMinutes:30,cancellationLeadMinutes:60},update:{bookingLeadMinutes:30,cancellationLeadMinutes:60}});
 });
 it("saves store fields without touching rules or bank",async()=>{
  expect(await saveCourseSettingsSection({section:"store",name:"新店名",address:"",mapUrl:"https://maps.example",lineOfficialUrl:""})).toMatchObject({success:true});expect(m.execute).toHaveBeenCalledTimes(2);expect(m.rules).not.toHaveBeenCalled();expect(m.execute.mock.calls.every(call=>!call[0].join("").includes('"bankName"'))).toBe(true);
 });
 it.each([
  {section:"booking",bookingLeadMinutes:-1,cancellationLeadMinutes:0},
  {section:"booking",bookingLeadMinutes:0,cancellationLeadMinutes:43201},
  {section:"booking",bookingLeadMinutes:1.5,cancellationLeadMinutes:0},
  {section:"store",name:" ",address:"",mapUrl:"",lineOfficialUrl:""},
  {section:"store",name:"店",address:"",mapUrl:"http://unsafe.example",lineOfficialUrl:""},
  {section:"payment",bankName:"銀行"},
 ])("rejects invalid or incomplete input before writing: %j",async data=>{expect(await saveCourseSettingsSection(data)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();});
 it("blocks denied permissions and expired subscriptions before writes",async()=>{
  const data={section:"booking",bookingLeadMinutes:0,cancellationLeadMinutes:0};
  m.manager.mockRejectedValueOnce(new AppError("FORBIDDEN","無權限"));expect(await saveCourseSettingsSection(data)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
  m.writable.mockRejectedValueOnce(new AppError("FORBIDDEN","已到期"));expect(await saveCourseSettingsSection(data)).toMatchObject({success:false,error:"已到期"});expect(m.transaction).not.toHaveBeenCalled();
 });
});
