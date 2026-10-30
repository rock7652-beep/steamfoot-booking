import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),manager:vi.fn(),transaction:vi.fn(),rule:vi.fn(),query:vi.fn(),permission:vi.fn(),audit:vi.fn()}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseBookingRule:{findUnique:m.rule},$queryRaw:m.query}}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.read,courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:m.audit}));
import {loadCourseDigitalManagerNotices,markCourseDigitalManagerNotice} from "@/server/actions/course-digital-manager-notices";
beforeEach(()=>{
 vi.resetAllMocks();
 m.read.mockResolvedValue({storeId:"a",user:{id:"u",role:"STAFF",staffId:"staff"},isChildStoreView:false});
 m.manager.mockResolvedValue({storeId:"a",user:{id:"u",name:"值班人員"}});
 m.rule.mockResolvedValue({backendNoticesEnabled:true});m.permission.mockResolvedValue(true);
 m.query.mockResolvedValue([]);
 m.transaction.mockImplementation(async(_store,work)=>work({courseBookingRule:{findUnique:m.rule},$queryRaw:m.query}));
});
it("checks current store and read permission before querying",async()=>{
 expect(await loadCourseDigitalManagerNotices({storeId:"b",handled:false})).toMatchObject({success:false});
 expect(m.query).not.toHaveBeenCalled();
 m.read.mockRejectedValueOnce(new Error("permission denied"));
 expect(await loadCourseDigitalManagerNotices({storeId:"a",handled:false})).toMatchObject({success:false});
 expect(m.query).not.toHaveBeenCalled();
});
it("returns generic labels without payment details and makes child-store views read only",async()=>{
 m.read.mockResolvedValue({storeId:"a",user:{role:"OWNER"},isChildStoreView:true});
 m.query.mockResolvedValueOnce([{id:"notice",eventType:"TRANSFER_PENDING_CONFIRMATION",handledAt:null,handledByName:null,revision:0,createdAt:new Date("2026-10-30T02:00:00Z")}]).mockResolvedValueOnce([{count:1}]);
 const result=await loadCourseDigitalManagerNotices({storeId:"a",handled:false});
 expect(result).toMatchObject({success:true,count:1,canHandle:false,items:[{id:"notice",eventType:"TRANSFER_PENDING_CONFIRMATION"}]});
 expect(m.query.mock.calls[0][0].join("")).not.toContain("targetId");
 expect(m.permission).not.toHaveBeenCalled();
});
it("requires write access, same store and the current revision",async()=>{
 m.manager.mockRejectedValueOnce(new Error("permission denied"));
 expect(await markCourseDigitalManagerNotice({storeId:"a",id:"n",handled:true,revision:0})).toMatchObject({success:false});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(await markCourseDigitalManagerNotice({storeId:"b",id:"n",handled:true,revision:0})).toMatchObject({success:false});
 expect(m.transaction).not.toHaveBeenCalled();
 expect(await markCourseDigitalManagerNotice({storeId:"a",id:"n",handled:true,revision:0})).toMatchObject({success:false});
 expect(m.query.mock.calls[0][0].join("")).toContain('AND "storeId"=');
 expect(m.query.mock.calls[0][0].join("")).toContain('AND revision=');
 expect(m.audit).not.toHaveBeenCalled();
});
it("audits a successful store-scoped update",async()=>{
 m.query.mockResolvedValue([{id:"n",revision:1,handledAt:new Date("2026-10-30T02:00:00Z"),handledByName:"值班人員"}]);
 expect(await markCourseDigitalManagerNotice({storeId:"a",id:"n",handled:true,revision:0})).toMatchObject({success:true,storeId:"a",data:{revision:1}});
 expect(m.audit).toHaveBeenCalledOnce();
});
