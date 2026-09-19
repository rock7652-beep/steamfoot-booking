import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),execute:vi.fn(),rules:vi.fn(),bank:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfig:m.revalidate}));
vi.mock("@/server/actions/shop",()=>({updateShopBankInfo:m.bank}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
import {saveCourseSettings,saveCoursePaymentSettings} from "@/server/actions/course-settings";
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
