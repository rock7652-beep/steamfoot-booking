import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),permission:vi.fn(),store:vi.fn(),target:vi.fn(),update:vi.fn(),receipt:vi.fn(),record:vi.fn(),snapshot:vi.fn(),raw:vi.fn(),create:vi.fn(),spaWrite:vi.fn(),cache:vi.fn()}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.session}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission,ALL_PERMISSIONS:["staff.manage"],getDefaultPermissionsForRole:()=>["staff.manage"]}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:async()=>"spa",requireSpaStore:async()=>{}}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:async()=>{},getStoreLimitsByStoreId:async()=>({maxStaff:10})}));
vi.mock("@/lib/usage-gate",()=>({checkStaffLimitOrThrow:async()=>{}}));
vi.mock("@/lib/spa-schema-readiness",()=>({isSpaOperationalSchemaReady:async()=>true,isSpaCompensationSchemaReady:async()=>true}));
vi.mock("@/server/services/staff-save-snapshot",()=>({readSavedStaff:m.snapshot}));
vi.mock("@/server/services/spa-initial-staff-write",()=>({writeInitialSpaStaff:m.spaWrite}));
vi.mock("@/server/services/operation-audit",()=>({recordOperationAudit:vi.fn()}));
vi.mock("@/lib/revalidation",()=>({revalidateStaff:vi.fn(),revalidateStaffPermissions:vi.fn(),revalidateStaffInRoute:m.cache}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findUnique:m.target,count:async()=>1},user:{findUnique:async()=>null,findFirst:async()=>null},auditLog:{findUnique:m.receipt},$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.raw,staff:{findUniqueOrThrow:m.target,findFirst:async()=>({id:"actor",permissions:[]}),update:m.update,count:async()=>1},user:{create:m.create,findUnique:async({where}:{where:{id?:string}})=>where.id?({role:"OWNER",status:"ACTIVE"}):null,findFirst:async()=>null},auditLog:{findUnique:m.receipt,create:m.record},staffPermission:{findMany:async()=>[],createMany:vi.fn()}})}}));
import {saveStaffConfirmed} from "@/server/actions/staff";
const version="2026-10-10T00:00:00.000Z",requestKey="11111111-1111-4111-a111-111111111111",receipt={expectedStoreId:"s",expectedVersion:version,requestKey};
const update={...receipt,id:"p",values:{displayName:"新姓名"}};
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({id:"owner",name:"老闆",role:"OWNER",staffId:"actor",storeId:"s"});m.permission.mockResolvedValue(true);m.store.mockResolvedValue("s");m.receipt.mockResolvedValue(null);m.target.mockResolvedValue({id:"p",storeId:"s",userId:"u",isOwner:false,status:"ACTIVE",updatedAt:new Date(version),user:{id:"u",role:"STAFF"}});m.snapshot.mockResolvedValue({id:"p",displayName:"資料庫確認姓名",updatedAt:version});m.raw.mockResolvedValue([]);m.create.mockResolvedValue({staff:{id:`staff-person:s:${requestKey}`}});});
it("updates once and returns persisted fields, with version/store guards before writes",async()=>{
 expect(await saveStaffConfirmed(update)).toMatchObject({success:true,storeId:"s",data:{displayName:"資料庫確認姓名"}});expect(m.update).toHaveBeenCalledOnce();expect(m.record).toHaveBeenCalledOnce();m.update.mockClear();
 expect(await saveStaffConfirmed({...update,expectedVersion:null})).toMatchObject({success:false,uncertain:false});expect(m.update).not.toHaveBeenCalled();
 expect(await saveStaffConfirmed({...update,expectedStoreId:"other"})).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it("retries a committed save without another account write; rejects foreign receipt actors",async()=>{
 m.receipt.mockResolvedValue({actorUserId:"owner",targetId:"p"});expect(await saveStaffConfirmed(update)).toMatchObject({success:true});expect(m.update).not.toHaveBeenCalled();
 m.receipt.mockResolvedValue({actorUserId:"foreign",targetId:"p"});expect(await saveStaffConfirmed(update)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it("creates a deterministic account and all initial SPA setup within the same transaction before recording success",async()=>{
 const result=await saveStaffConfirmed({...receipt,expectedVersion:null,values:{name:"小美",displayName:"小美",phone:"0912345678",password:"test-only-password",spaSkillKeys:["body"],spaWeeklyAvailability:[{dayOfWeek:1,startTime:"10:00",endTime:"18:00"}],spaCompensation:{mode:"PERCENTAGE",value:30}}});
 expect(result).toMatchObject({success:true});expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({id:`staff-user:s:${requestKey}`,staff:{create:expect.objectContaining({id:`staff-person:s:${requestKey}`})}})}));
 expect(m.spaWrite).toHaveBeenCalledWith(expect.anything(),"s",`staff-person:s:${requestKey}`,expect.objectContaining({spaSkillKeys:["body"]}));expect(m.spaWrite.mock.invocationCallOrder[0]).toBeLessThan(m.record.mock.invocationCallOrder[0]);
});
it("a committed create retry succeeds despite occupied email, without recreating setup or account",async()=>{
 m.receipt.mockResolvedValue({actorUserId:"owner",targetId:`staff-person:s:${requestKey}`});
 expect(await saveStaffConfirmed({...receipt,expectedVersion:null,values:{name:"小美",displayName:"小美",phone:"0912345678",password:"test-only-password",email:"occupied@example.test"}})).toMatchObject({success:true});expect(m.create).not.toHaveBeenCalled();expect(m.spaWrite).not.toHaveBeenCalled();
});
it("management permission and same-store target guards remain effective",async()=>{
 m.permission.mockResolvedValue(false);expect(await saveStaffConfirmed(update)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();m.permission.mockResolvedValue(true);m.target.mockResolvedValue({storeId:"foreign",user:{role:"STAFF"}});expect(await saveStaffConfirmed(update)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
