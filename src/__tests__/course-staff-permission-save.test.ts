import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),feature:vi.fn(),limits:vi.fn(),staff:vi.fn(),count:vi.fn(),update:vi.fn(),user:vi.fn(),permission:vi.fn(),raw:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature,getStoreLimitsByStoreId:m.limits}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.raw,staff:{findFirst:m.staff,count:m.count,update:m.update},user:{update:m.user},staffMemberLink:{updateMany:vi.fn()},staffPermission:{upsert:m.permission}})}}));
vi.mock("@/lib/revalidation",()=>({revalidateStaff:vi.fn(),revalidateStaffPermissions:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
import {saveCourseStaff} from "@/server/actions/course-staff";
const input={id:"manager2",name:"Manager",kind:"manager",requestKey:"11111111-1111-4111-a111-111111111111"};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({user:{id:"owner",role:"OWNER",staffId:"manager1"},storeId:"s"});m.limits.mockResolvedValue({maxStaff:10});m.staff.mockResolvedValue({id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"OWNER"}});m.count.mockResolvedValue(2);});
it("can grant implemented transaction permissions, then explicitly revoke refund without granting headquarters",async()=>{
 expect(await saveCourseStaff({...input,permissions:["transaction.read","transaction.create","transaction.void","transaction.refund","customer.assign"]})).toMatchObject({success:true});
 expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission:"transaction.refund"}},update:{granted:true}}));
 m.permission.mockClear();expect(await saveCourseStaff({...input,permissions:["transaction.read"]})).toMatchObject({success:true});
 expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission:"transaction.refund"}},update:{granted:false}}));
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{id:"manager2",storeId:"s"}}));
});
it("requires an authorized owner and rejects permissions outside the course module",async()=>{
 m.manager.mockResolvedValue({user:{role:"CUSTOMER"},storeId:"s"});expect(await saveCourseStaff(input)).toMatchObject({success:false});expect(m.staff).not.toHaveBeenCalled();
 m.manager.mockResolvedValue({user:{role:"OWNER"},storeId:"s"});expect(await saveCourseStaff({...input,permissions:["transaction.discount"]})).toMatchObject({success:false});expect(m.permission).not.toHaveBeenCalled();
});
it("saves and revokes course export permissions independently",async()=>{
 expect(await saveCourseStaff({...input,permissions:["customer.read","customer.export","report.read","report.export"]})).toMatchObject({success:true});
 for(const permission of ["customer.export","report.export"]){
  expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission}},update:{granted:true}}));
 }
 m.permission.mockClear();
 expect(await saveCourseStaff({...input,permissions:["customer.read","report.read"]})).toMatchObject({success:true});
 for(const permission of ["customer.export","report.export"]){
  expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission}},update:{granted:false}}));
 }
});
it("blocks coach removal with an ongoing class but allows confirmed whole-person revocation without suspending the member account",async()=>{
 m.staff.mockResolvedValue({id:"manager2",userId:"u2",status:"ACTIVE",courseCoachEnabled:true,courseQualifiedTemplateIds:[],user:{role:"OWNER"}});
 m.raw.mockImplementation(async(sql:TemplateStringsArray)=>sql.join("").includes('FROM "CourseSession"') ? [{id:"ongoing",name:"進行中課程",startsAt:new Date(),capacity:5}] : []);
 expect(await saveCourseStaff({...input,coachEnabled:false})).toMatchObject({success:false,conflicts:[{id:"ongoing"}]});
 expect(m.update).not.toHaveBeenCalled();
 expect(await saveCourseStaff({...input,active:false})).toMatchObject({success:false});
 expect(await saveCourseStaff({...input,active:false,confirmDeactivate:true})).toMatchObject({success:true});
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"INACTIVE"})}));
 expect(m.user).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({status:"SUSPENDED"})}));
});
it("removing coach role after handover preserves the manager role and one Staff row",async()=>{
 m.staff.mockResolvedValue({id:"manager2",userId:"u2",status:"ACTIVE",courseCoachEnabled:true,courseQualifiedTemplateIds:[],user:{role:"OWNER"}});
 m.raw.mockResolvedValue([]);
 expect(await saveCourseStaff({...input,coachEnabled:false})).toMatchObject({success:true});
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"manager2"},data:expect.objectContaining({status:"ACTIVE",courseCoachEnabled:false})}));
 expect(m.user).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({role:"CUSTOMER"})}));
});
