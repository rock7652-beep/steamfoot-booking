vi.mock("@/server/services/music-finance-access",()=>({canMusicFinance:async()=>true,requireMusicFinance:async()=>{},isMusicFinanceStore:()=>m.music(),readMusicFinanceScope:()=>m.scope()}));
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({music:vi.fn(),scope:vi.fn(),manager:vi.fn(),feature:vi.fn(),limits:vi.fn(),staff:vi.fn(),count:vi.fn(),update:vi.fn(),user:vi.fn(),permission:vi.fn(),raw:vi.fn(),linkFind:vi.fn(),linkCreate:vi.fn(),linkDelete:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature,getStoreLimitsByStoreId:m.limits}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.raw,staff:{findFirst:m.staff,count:m.count,update:m.update},user:{update:m.user,findUnique:async()=>({role:"OWNER",status:"ACTIVE"})},staffMemberLink:{updateMany:vi.fn()},courseStaffPersonLink:{findFirst:m.linkFind,create:m.linkCreate,delete:m.linkDelete},staffPermission:{upsert:m.permission,findMany:async()=>[]}})}}));
vi.mock("@/lib/revalidation",()=>({revalidateStaff:vi.fn(),revalidateStaffPermissions:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
import {saveCourseStaff} from "@/server/actions/course-staff";
const input={id:"manager2",name:"Manager",kind:"manager",requestKey:"11111111-1111-4111-a111-111111111111"};
beforeEach(()=>{vi.resetAllMocks();m.music.mockResolvedValue(false);m.scope.mockResolvedValue(null);m.raw.mockResolvedValue([]);m.manager.mockResolvedValue({user:{id:"owner",role:"OWNER",staffId:"manager1"},storeId:"s"});m.limits.mockResolvedValue({maxStaff:10});m.staff.mockImplementation(async({where})=>where.id==="manager1"?{id:"manager1",isOwner:true,permissions:[]}:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});m.count.mockResolvedValue(2);m.linkFind.mockResolvedValue(null);m.linkCreate.mockResolvedValue({id:"link1",managerStaffId:"manager2",instructorStaffId:"coach2"});});
it("can grant implemented transaction permissions, then explicitly revoke refund without granting headquarters",async()=>{
 expect(await saveCourseStaff({...input,permissions:["transaction.read","transaction.create","transaction.void","transaction.refund","customer.assign"]})).toMatchObject({success:true});
 expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission:"transaction.refund"}},update:{granted:true}}));
 m.permission.mockClear();expect(await saveCourseStaff({...input,permissions:["transaction.read"]})).toMatchObject({success:true});
 expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission:"transaction.refund"}},update:{granted:false}}));
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{id:"manager2",storeId:"s"}}));
});
it("does not invalidate the current login when only its permissions change",async()=>{
 m.staff.mockResolvedValue({id:"manager1",userId:"owner",status:"ACTIVE",isOwner:true,courseCoachEnabled:false,courseQualifiedTemplateIds:[],user:{id:"owner",role:"OWNER",name:"Owner",email:"owner@example.com",status:"ACTIVE"},permissions:[]});
 expect(await saveCourseStaff({...input,id:"manager1",name:"Owner",email:"owner@example.com",permissions:["staff.manage"]})).toMatchObject({success:true});
 expect(m.user).not.toHaveBeenCalled();
 expect(m.permission).toHaveBeenCalled();
});
it("requires an authorized owner and rejects permissions outside the course module",async()=>{
 m.manager.mockResolvedValue({user:{role:"CUSTOMER"},storeId:"s"});expect(await saveCourseStaff(input)).toMatchObject({success:false});expect(m.staff).not.toHaveBeenCalled();
 m.manager.mockResolvedValue({user:{role:"STAFF"},storeId:"s"});expect(await saveCourseStaff({...input,permissions:["transaction.discount"]})).toMatchObject({success:false});expect(m.permission).not.toHaveBeenCalled();
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
 m.staff.mockResolvedValue({id:"manager2",userId:"u2",status:"ACTIVE",courseCoachEnabled:true,courseQualifiedTemplateIds:[],user:{role:"STAFF"}});
 m.raw.mockImplementation(async(sql:TemplateStringsArray)=>sql.join("").includes('FROM "CourseSession"') ? [{id:"ongoing",name:"進行中課程",startsAt:new Date(),capacity:5}] : []);
 expect(await saveCourseStaff({...input,coachEnabled:false})).toMatchObject({success:false,conflicts:[{id:"ongoing"}]});
 expect(m.update).not.toHaveBeenCalled();
 expect(await saveCourseStaff({...input,active:false})).toMatchObject({success:false});
 expect(await saveCourseStaff({...input,active:false,confirmDeactivate:true})).toMatchObject({success:true});
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"INACTIVE"})}));
 expect(m.user).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({status:"SUSPENDED"})}));
});
it("removing coach role after handover preserves the manager role and one Staff row",async()=>{
 m.staff.mockResolvedValue({id:"manager2",userId:"u2",status:"ACTIVE",courseCoachEnabled:true,courseQualifiedTemplateIds:[],user:{role:"STAFF"}});
 m.raw.mockResolvedValue([]);
 expect(await saveCourseStaff({...input,coachEnabled:false})).toMatchObject({success:true});
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"manager2"},data:expect.objectContaining({status:"ACTIVE",courseCoachEnabled:false})}));
 expect(m.user).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({role:"CUSTOMER"})}));
});

it("delegated staff cannot grant a financial permission they do not hold",async()=>{
 m.manager.mockResolvedValue({user:{id:"owner",role:"MANAGER",staffId:"manager1"},storeId:"s"});
 m.staff.mockImplementation(async({where})=>where.id==="manager1"?{id:"manager1",isOwner:false,permissions:[{permission:"staff.manage"}]}:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});
 expect(await saveCourseStaff({...input,permissions:["teacher.settlement.pay"]})).toMatchObject({success:false});expect(m.permission).not.toHaveBeenCalled();
});

it("delegated operators cannot widen scope even by omitting scope from permission updates",async()=>{
 m.music.mockResolvedValue(true);m.scope.mockResolvedValue(["teacher-a"]);
 for(const financeTeacherIds of [undefined,null,["teacher-b"]]){
   expect(await saveCourseStaff({...input,financeTeacherIds})).toMatchObject({success:false});
 }
 expect(m.permission).not.toHaveBeenCalled();
});
it("teacher scope is restricted to the same store and recorded with an audit",async()=>{
 m.music.mockResolvedValue(true);m.count.mockResolvedValue(1);
 expect(await saveCourseStaff({...input,financeTeacherIds:["teacher-a"]})).toMatchObject({success:true});
 expect(m.count).toHaveBeenCalledWith({where:{storeId:"s",id:{in:["teacher-a"]},courseCoachEnabled:true}});
 expect(m.raw.mock.calls.some(c=>c[0].join("").includes('INSERT INTO "CourseTeacherFinanceScope"'))).toBe(true);
 m.count.mockResolvedValue(0);m.permission.mockClear();
 expect(await saveCourseStaff({...input,financeTeacherIds:["foreign-teacher"]})).toMatchObject({success:false});
 expect(m.permission).not.toHaveBeenCalled();
});

it("links only the opposite work role in the same store, without granting permissions to that role",async()=>{
 m.staff.mockImplementation(async({where})=>where.id==="manager1"?{id:"manager1",isOwner:true,permissions:[]} : where.id==="coach2"?{id:"coach2",userId:"coach-user",user:{role:"CUSTOMER"}}:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});
 expect(await saveCourseStaff({...input,linkedStaffId:"coach2",phone:"0912345678"})).toMatchObject({success:true});
 expect(m.linkCreate).toHaveBeenCalledWith({data:{storeId:"s",managerStaffId:"manager2",instructorStaffId:"coach2",linkedByUserId:"owner"}});
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"coach2"},data:expect.objectContaining({phone:"0912345678",displayName:"Manager"})}));
 expect(m.user).toHaveBeenCalledWith({where:{id:"coach-user"},data:{name:"Manager"}});
 expect(m.permission.mock.calls.every(c=>c[0].where.staffId_permission.staffId==="manager2")).toBe(true);
 m.linkCreate.mockClear();m.staff.mockImplementation(async({where})=>where.id==="coach2"?{id:"coach2",user:{role:"STAFF"}}:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});
 expect(await saveCourseStaff({...input,linkedStaffId:"coach2"})).toMatchObject({success:false});
 expect(m.linkCreate).not.toHaveBeenCalled();
});

it("rejects an instructor already linked to another person",async()=>{
 m.staff.mockImplementation(async({where})=>where.id==="manager1"?{id:"manager1",isOwner:true,permissions:[]} : where.id==="coach2"?{id:"coach2",userId:"coach-user",user:{role:"CUSTOMER"}}:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});
 m.linkFind.mockResolvedValueOnce(null).mockResolvedValueOnce({id:"occupied",managerStaffId:"another-manager",instructorStaffId:"coach2"});
 const result=await saveCourseStaff({...input,linkedStaffId:"coach2"});
 expect(result).toMatchObject({success:false,error:expect.stringContaining("已連結其他身分")});
 expect(m.linkCreate).not.toHaveBeenCalled(); expect(m.linkDelete).not.toHaveBeenCalled();
});

it("rejects self links and a counterpart outside the current store",async()=>{
 expect(await saveCourseStaff({...input,linkedStaffId:"manager2"})).toMatchObject({success:false});
 m.staff.mockImplementation(async({where})=>where.id==="foreign-coach"?null:{id:"manager2",userId:"u2",status:"ACTIVE",user:{role:"STAFF"}});
 expect(await saveCourseStaff({...input,linkedStaffId:"foreign-coach"})).toMatchObject({success:false});
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{id:"foreign-coach",storeId:"s"}}));
 expect(m.linkCreate).not.toHaveBeenCalled();
});

it("preserves an existing person link instead of silently replacing it",async()=>{
 m.linkFind.mockResolvedValue({id:"prior",managerStaffId:"manager2",instructorStaffId:"original-coach"});
 expect(await saveCourseStaff({...input,linkedStaffId:"different-coach"})).toMatchObject({success:false,error:expect.stringContaining("先解除舊連結")});
 expect(m.linkCreate).not.toHaveBeenCalled(); expect(m.linkDelete).not.toHaveBeenCalled();
});

 it("rejects a stale default coach fee without overwriting the newer value",async()=>{
  m.staff.mockImplementation(async({where})=>where.id==="manager1"?{id:"manager1",isOwner:true,permissions:[]}:{id:"coach2",userId:"coach-user",updatedAt:new Date("2026-09-30T00:00:00.000Z"),user:{role:"CUSTOMER"}});
  expect(await saveCourseStaff({...input,id:"coach2",kind:"coach",name:"Coach",defaultClassFee:0,teachingVersion:"2026-09-29T00:00:00.000Z"})).toMatchObject({success:false});
  expect(m.update).not.toHaveBeenCalled();
 });

it("promotes an existing account in place while saving selected permissions", async()=>{
 expect(await saveCourseStaff({...input,backendRole:"MANAGER",permissions:["staff.manage","customer.read"]})).toMatchObject({success:true});
 expect(m.user).toHaveBeenCalledWith({where:{id:"u2"},data:{role:"MANAGER"}});
 expect(m.permission).toHaveBeenCalledWith(expect.objectContaining({where:{staffId_permission:{staffId:"manager2",permission:"staff.manage"}},update:{granted:true}}));
});
it("Manager cannot promote a Staff account",async()=>{
 m.manager.mockResolvedValue({user:{id:"actor",role:"MANAGER",staffId:"manager1"},storeId:"s"});
 expect(await saveCourseStaff({...input,backendRole:"MANAGER"})).toMatchObject({success:false});
 expect(m.user).not.toHaveBeenCalled();expect(m.permission).not.toHaveBeenCalled();
});
