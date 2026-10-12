import {beforeEach,expect,it,vi} from "vitest";
import {registerHqStoreViewContext} from "@/lib/hq-store-view-context";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),query:vi.fn(),user:vi.fn(),staff:vi.fn(),update:vi.fn(),write:vi.fn(),audit:vi.fn(),routeTag:vi.fn(),actionTag:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/server/services/staff-permission-write",()=>({writeStaffPermissionChanges:m.write}));
vi.mock("@/lib/revalidation",()=>({revalidateStaffPermissions:m.actionTag,revalidateStaffPermissionsInRoute:m.routeTag}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {saveCourseWorkPermission} from "@/server/services/course-work-permission-save";
import {saveCourseOwnIncomeAccess} from "@/server/actions/course-own-income-access";
const input={storeId:"store-a",staffId:"teacher-a",enabled:true,previous:false};
beforeEach(()=>{
 vi.resetAllMocks();
 m.manager.mockResolvedValue({storeId:"store-a",user:{id:"owner",staffId:"owner-staff",role:"OWNER"}});
 m.transaction.mockImplementation(fn=>fn({$queryRaw:m.query,user:{findFirst:m.user},staff:{findFirst:m.staff,update:m.update},staffPermission:{upsert:m.write},auditLog:{create:m.audit}}));
 m.user.mockResolvedValue({id:"owner"});
 m.staff.mockImplementation(({where})=>where.id==="owner-staff"?{id:"owner-staff"}:{id:"teacher-a",permissions:[]});
 m.update.mockResolvedValue({updatedAt:new Date("2026-10-11T14:00:00Z")});
});
it.each(["MANAGER","STAFF","CUSTOMER","ADMIN"])("denies %s even with staff.manage or forged input",async role=>{
 m.manager.mockResolvedValue({storeId:"store-a",user:{id:"actor",role}});
 expect((await saveCourseOwnIncomeAccess({...input,role:"OWNER"})).success).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
});
it("allows verified HQ owner view without using the client role",async()=>{
 m.manager.mockResolvedValue({storeId:"store-a",user:registerHqStoreViewContext({id:"hq",role:"ADMIN"},"store-a")});
 expect((await saveCourseOwnIncomeAccess(input)).success).toBe(true);
});
it("writes only one explicit grant and audits the owner",async()=>{
 expect(await saveCourseOwnIncomeAccess(input)).toMatchObject({success:true,data:{enabled:true}});
 expect(m.manager).toHaveBeenCalledWith("staff.manage");
 expect(m.staff).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:"teacher-a",storeId:"store-a",courseCoachEnabled:true,user:{role:"CUSTOMER"}}}));
 expect(m.write).toHaveBeenCalledWith({where:{staffId_permission:{staffId:"teacher-a",permission:"teacher.income.read.self"}},create:{staffId:"teacher-a",permission:"teacher.income.read.self",granted:true},update:{granted:true}});
 expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorUserId:"owner",storeId:"store-a",afterJson:{storeId:"store-a",ownIncomeEnabled:true}})}));
});
it("can revoke without touching other grants",async()=>{
 m.staff.mockImplementation(({where})=>where.id==="owner-staff"?{id:"owner-staff"}:{id:"teacher-a",permissions:[{permission:"teacher.income.read.self"}]});
 expect((await saveCourseOwnIncomeAccess({...input,enabled:false,previous:true})).success).toBe(true);
 expect(m.write).toHaveBeenCalledWith(expect.objectContaining({update:{granted:false}}));
});
it("rejects a changed store before mutation",async()=>{
 expect((await saveCourseOwnIncomeAccess({...input,storeId:"store-b"})).success).toBe(false);
 expect(m.transaction).not.toHaveBeenCalled();
});
it("rejects foreign or non-instructor targets",async()=>{
 m.staff.mockImplementation(({where})=>where.id==="owner-staff"?{id:"owner-staff"}:null);
 expect((await saveCourseOwnIncomeAccess(input)).success).toBe(false);
 expect(m.write).not.toHaveBeenCalled();
});
it("rejects stale settings rather than undoing another owner",async()=>{
 m.staff.mockResolvedValue({id:"teacher-a",permissions:[{permission:"teacher.income.read.self"}]});
 expect((await saveCourseOwnIncomeAccess(input)).success).toBe(false);
 expect(m.write).not.toHaveBeenCalled();
});
it("rechecks an owner who lost their role or active membership",async()=>{
 m.user.mockResolvedValue(null);
 expect((await saveCourseOwnIncomeAccess(input)).success).toBe(false);expect(m.write).not.toHaveBeenCalled();
 m.user.mockResolvedValue({id:"owner"});m.staff.mockResolvedValue(null);
 expect((await saveCourseOwnIncomeAccess(input)).success).toBe(false);expect(m.write).not.toHaveBeenCalled();
});

it.each(["teacher.booking.leave","teacher.booking.reschedule","teacher.session.leave","teacher.session.reschedule"] as const)("writes only the chosen work grant %s",async permission=>{
 expect((await saveCourseOwnIncomeAccess({...input,permission})).success).toBe(true);
 expect(m.write).toHaveBeenCalledWith({where:{staffId_permission:{staffId:"teacher-a",permission}},create:{staffId:"teacher-a",permission,granted:true},update:{granted:true}});
});
it("rejects arbitrary backend permission grants",async()=>{
 expect((await saveCourseOwnIncomeAccess({...input,permission:"staff.manage"})).success).toBe(false);
 expect(m.write).not.toHaveBeenCalled();
});

it("route receipt expires authorization without Server Action-only updateTag",async()=>{expect(await saveCourseWorkPermission(input,"route")).toMatchObject({success:true,data:{storeId:"store-a",staffId:"teacher-a",permission:"teacher.income.read.self"}});expect(m.routeTag).toHaveBeenCalledOnce();expect(m.actionTag).not.toHaveBeenCalled();});
