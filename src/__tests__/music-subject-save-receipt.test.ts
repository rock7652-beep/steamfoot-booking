import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({native:false,manager:vi.fn(),feature:vi.fn(),create:vi.fn(),find:vi.fn(),update:vi.fn(),findSaved:vi.fn(),templates:vi.fn(),templateUpdate:vi.fn(),templateCreate:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:()=>m.native}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.feature}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:async(_store:string,work:(tx:unknown)=>unknown)=>work({courseTemplate:{findMany:m.templates,updateMany:m.templateUpdate,create:m.templateCreate},musicSubject:{create:m.create,findFirst:m.find,updateMany:m.update,findFirstOrThrow:m.findSaved}})}));
import {saveMusicSubjectWithReceipt} from "@/server/services/music-subject-save";
const input={name:"吉他",category:"",description:"",isActive:true,expectedStoreId:"store-a",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
beforeEach(()=>{vi.clearAllMocks();m.native=false;m.manager.mockResolvedValue({storeId:"store-a",user:{id:"u"}});m.feature.mockResolvedValue({storeId:"store-a"});m.find.mockResolvedValue(null);m.create.mockImplementation(async({data})=>({...data,updatedAt:new Date("2026-10-10T00:00:00Z")}));});
it("returns only the committed row and reuses the durable receipt on retry",async()=>{
 const first=await saveMusicSubjectWithReceipt(input);
 expect(first).toMatchObject({storeId:"store-a",data:{id:expect.stringMatching(/^subject_/),name:"吉他",updatedAt:"2026-10-10T00:00:00.000Z"}});
 m.find.mockResolvedValue({...first.data,storeId:"store-a",updatedAt:new Date(first.data.updatedAt)});
 expect(await saveMusicSubjectWithReceipt(input)).toEqual(first);
 expect(m.create).toHaveBeenCalledTimes(1);
 expect(m.manager).toHaveBeenCalledTimes(2);
});
it("rejects wrong stores before writing and preserves edit revision checks",async()=>{
 await expect(saveMusicSubjectWithReceipt({...input,expectedStoreId:"other"})).rejects.toThrow("店舖已切換");expect(m.create).not.toHaveBeenCalled();
 m.update.mockResolvedValue({count:0});
 await expect(saveMusicSubjectWithReceipt({...input,id:"s",expectedUpdatedAt:"2026-10-09T00:00:00Z"})).rejects.toThrow("已有更新");
 expect(m.manager).toHaveBeenLastCalledWith("booking.update");
 expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"s",storeId:"store-a",updatedAt:new Date("2026-10-09T00:00:00Z")}}));
});
it("does not replay a same-key create with a different payload",async()=>{
 m.find.mockResolvedValue({...input,id:"receipt",name:"鋼琴",updatedAt:new Date()});
 await expect(saveMusicSubjectWithReceipt(input)).rejects.toThrow("內容不同");expect(m.create).not.toHaveBeenCalled();
});
it("confirms an already applied edit after a lost response without overwriting newer data",async()=>{
 m.update.mockResolvedValue({count:0});
 const saved={id:"s",storeId:"store-a",name:input.name,category:"",description:"",isActive:true,updatedAt:new Date("2026-10-10T00:00:00Z")};
 m.find.mockResolvedValue(saved);
 const edit={...input,id:"s",expectedUpdatedAt:"2026-10-09T00:00:00Z"};
 expect(await saveMusicSubjectWithReceipt(edit)).toMatchObject({data:{id:"s",name:"吉他",updatedAt:saved.updatedAt.toISOString()}});
 expect(m.update).toHaveBeenCalledTimes(1);expect(m.findSaved).not.toHaveBeenCalled();
 m.find.mockResolvedValue({...saved,description:"另一位教師已更新"});
 await expect(saveMusicSubjectWithReceipt(edit)).rejects.toThrow("已有更新");
 expect(m.update).toHaveBeenCalledTimes(2);expect(m.create).not.toHaveBeenCalled();
});
it("still rejects unavailable music features",async()=>{
 m.feature.mockResolvedValue(null);await expect(saveMusicSubjectWithReceipt(input)).rejects.toThrow("僅適用音樂教室");expect(m.create).not.toHaveBeenCalled();
});

const sportsRule={pointCost:3,coachIds:["coach"],expectedCoachIds:[],compensation:{mode:"SHARE",value:60},expectedCompensation:null};
it.each(["STAFF","MANAGER"])("does not let %s change item compensation or coach qualifications",async role=>{
 m.native=true;m.manager.mockResolvedValue({storeId:"store-a",user:{id:"u",role}});
 await expect(saveMusicSubjectWithReceipt({...input,sportsRule})).rejects.toThrow("僅店長");
 expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it("checks independent compensation permission before any sports item write",async()=>{
 m.native=true;m.manager.mockImplementation(async permission=>{if(permission==="teacher.compensation.manage")throw new Error("FORBIDDEN");return {storeId:"store-a",user:{id:"u",role:"OWNER"}};});
 await expect(saveMusicSubjectWithReceipt({...input,sportsRule})).rejects.toThrow("FORBIDDEN");
 expect(m.create).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});

it("saves native music defaults atomically and confirms a same-key retry without another schedule template",async()=>{
 const native={durationMinutes:50,visibility:"PUBLIC",precautions:"帶樂器"};m.templates.mockResolvedValue([]);
 const first=await saveMusicSubjectWithReceipt({...input,nativeDefaults:native});
 expect(m.templateCreate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({...native,storeId:"store-a",musicSubjectId:first.data.id,capacity:1})}));
 m.find.mockResolvedValue({...first.data,storeId:"store-a",updatedAt:new Date(first.data.updatedAt)});
 m.templates.mockResolvedValue([{id:"t",...native,description:""}]);
 expect(await saveMusicSubjectWithReceipt({...input,nativeDefaults:native})).toEqual(first);expect(m.templateCreate).toHaveBeenCalledTimes(1);
 m.templates.mockResolvedValue([{id:"t",...native,durationMinutes:60,description:""}]);
 await expect(saveMusicSubjectWithReceipt({...input,nativeDefaults:native})).rejects.toThrow("已有更新");
});
