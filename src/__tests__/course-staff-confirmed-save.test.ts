import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({native:false,finance:true,manager:vi.fn(),staff:vi.fn(),update:vi.fn(),user:vi.fn(),raw:vi.fn(),receipt:vi.fn(),record:vi.fn(),snapshot:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.native}));
vi.mock("@/lib/permissions",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/permissions")>(),checkPermission:async()=>m.finance}));
vi.mock("@/server/services/music-finance-access",()=>({canMusicFinance:async()=>true,requireMusicFinance:async()=>{},isMusicFinanceStore:async()=>false,readMusicFinanceScope:async()=>null}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseManagerRead:m.manager}));
vi.mock("@/server/services/course-staff-save-snapshot",()=>({readSavedCourseStaff:m.snapshot}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:async()=>{},getStoreLimitsByStoreId:async()=>({maxStaff:10})}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:m.staff},$queryRaw:m.raw,$transaction:async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,$executeRaw:m.raw,staff:{findFirst:m.staff,count:async()=>2,update:m.update},user:{update:m.user},staffMemberLink:{updateMany:vi.fn()},auditLog:{findUnique:m.receipt,create:m.record}})}}));
vi.mock("@/lib/revalidation",()=>({revalidateStaff:vi.fn(),revalidateStaffPermissions:vi.fn(),revalidateStaffInRoute:m.invalidate}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
import {saveCourseStaffConfirmed,readCourseStaffTeaching} from "@/server/actions/course-staff";
const version="2026-10-10T00:00:00.000Z",requestKey="11111111-1111-4111-a111-111111111111";
const input={expectedStoreId:"s",expectedVersion:version,requestKey,values:{id:"p",kind:"coach",name:"新教師",requestKey:"22222222-2222-4222-a222-222222222222"}};
beforeEach(()=>{vi.resetAllMocks();m.native=false;m.finance=true;m.manager.mockResolvedValue({user:{id:"owner",role:"OWNER",staffId:"actor"},storeId:"s"});m.raw.mockResolvedValue([]);m.receipt.mockResolvedValue(null);m.staff.mockResolvedValue({id:"p",userId:"u",status:"ACTIVE",updatedAt:new Date(version),courseCoachEnabled:true,courseQualifiedTemplateIds:[],courseQualificationsConfirmed:true,user:{role:"CUSTOMER",name:"舊教師"}});m.snapshot.mockResolvedValue({rows:[{id:"p",name:"資料庫確認教師",updatedAt:version}]});});
it("returns database authority and binds its receipt to the actor, store and outer request key",async()=>{
 expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:true,storeId:"s",data:{rows:[{name:"資料庫確認教師"}]}});
 expect(m.update).toHaveBeenCalledTimes(1);expect(m.record).toHaveBeenCalledWith({data:expect.objectContaining({id:`course-staff-receipt:s:${requestKey}`,actorUserId:"owner",targetId:"p"})});
 expect(m.snapshot).toHaveBeenCalledWith("s","p",expect.objectContaining({id:"owner"}),[]);expect(m.invalidate).toHaveBeenCalledOnce();
});
it("stale versions and switched stores reject without any mutation",async()=>{
 expect(await saveCourseStaffConfirmed({...input,expectedVersion:"2026-10-09T00:00:00.000Z"})).toMatchObject({success:false,uncertain:false});
 expect(m.update).not.toHaveBeenCalled();expect(m.record).not.toHaveBeenCalled();m.staff.mockClear();
 expect(await saveCourseStaffConfirmed({...input,expectedStoreId:"other"})).toMatchObject({success:false,uncertain:false});expect(m.staff).not.toHaveBeenCalled();
});
it("a committed retry bypasses stale versions and mutations, while re-reading confirmed rows",async()=>{
 m.receipt.mockResolvedValue({actorUserId:"owner",targetId:"p",afterJson:{relatedIds:["old-counterpart"]}});
 expect(await saveCourseStaffConfirmed({...input,expectedVersion:null})).toMatchObject({success:true});expect(m.update).not.toHaveBeenCalled();expect(m.staff).not.toHaveBeenCalled();expect(m.record).not.toHaveBeenCalled();expect(m.snapshot).toHaveBeenCalledWith("s","p",expect.anything(),["old-counterpart"]);
});
it("cannot reuse another actor's receipt or bypass management authority",async()=>{
 m.receipt.mockResolvedValue({actorUserId:"another",targetId:"p"});expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:false,uncertain:false});expect(m.snapshot).not.toHaveBeenCalled();
 m.manager.mockResolvedValue({user:{id:"owner",role:"STAFF"},storeId:"s"});expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it("lost acknowledgement stays uncertain; same-key retry reads authority without another write",async()=>{
 m.snapshot.mockRejectedValueOnce(new Error("connection lost"));expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:false,uncertain:true});expect(m.update).toHaveBeenCalledOnce();
 m.receipt.mockResolvedValue({actorUserId:"owner",targetId:"p"});expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:true});expect(m.update).toHaveBeenCalledOnce();
});
it("a committed save remains successful when cache invalidation fails",async()=>{
 m.invalidate.mockImplementation(()=>{throw new Error("cache down");});expect(await saveCourseStaffConfirmed(input)).toMatchObject({success:true,syncWarning:true});expect(m.update).toHaveBeenCalledOnce();
});

function nativeFeeInput(mode:string|null="HOUR",value=800){
 m.native=true;
 m.staff.mockResolvedValue({id:"p",userId:"u",status:"ACTIVE",updatedAt:new Date(version),courseCoachEnabled:true,courseQualifiedTemplateIds:["item"],courseQualificationsConfirmed:true,user:{role:"CUSTOMER",name:"教練"}});
 m.raw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes('SELECT id FROM "CourseTemplate"')?[{id:"item"}]:parts.join("").includes('SELECT "templateId", revision')?[{templateId:"item",revision:2}]:[]);
 return {...input,values:{...input.values,teachingVersion:version,qualificationIds:["item"],teachingFees:[{templateId:"item",value:mode?{mode,value}:null,revision:2}]}};
}
it.each(["HOUR","SHARE","CLASS",null])("運動教練可儲存個別 %s 或恢復沿用，並保留修訂紀錄",async(mode)=>{
 const d=nativeFeeInput(mode,mode==="SHARE"?70:800);
 expect(await saveCourseStaffConfirmed(d)).toMatchObject({success:true});
 const inserts=m.raw.mock.calls.filter(([parts])=>(parts as TemplateStringsArray).join("").includes('INSERT INTO "CourseCompensation"'));
 expect(inserts).toHaveLength(1);
 expect(inserts[0]).toContain(JSON.stringify(mode?[{mode,value:mode==="SHARE"?70:800}]:[]));
});
it("未授權計酬不可透過人員儲存繞過，且非法費率不落盤",async()=>{
 const d=nativeFeeInput();m.finance=false;
 expect(await saveCourseStaffConfirmed(d)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
 m.finance=true;expect(await saveCourseStaffConfirmed(nativeFeeInput("SHARE",101))).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it("個別費率修訂衝突不能覆蓋，其他模組仍拒絕運動鐘點設定",async()=>{
 const d=nativeFeeInput();d.values.teachingFees[0].revision=1;
 expect(await saveCourseStaffConfirmed(d)).toMatchObject({success:false,error:expect.stringContaining("已更新")});expect(m.update).not.toHaveBeenCalled();
 const other=nativeFeeInput();m.native=false;
 expect(await saveCourseStaffConfirmed(other)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});

it("未授權讀計酬時只回授課資格，不查詢費率或共用預設",async()=>{
 nativeFeeInput();m.finance=false;m.raw.mockClear();
 expect(await readCourseStaffTeaching("p")).toMatchObject({success:true,qualificationIds:["item"],fees:[],defaults:[]});
 expect(m.raw).not.toHaveBeenCalled();
});
it("不讀取別店教練設定",async()=>{
 nativeFeeInput();m.staff.mockResolvedValue(null);m.raw.mockClear();
 expect(await readCourseStaffTeaching("other-store-coach")).toMatchObject({success:false});
 expect(m.staff).toHaveBeenCalledWith({where:{id:"other-store-coach",storeId:"s"}});expect(m.raw).not.toHaveBeenCalled();
});
