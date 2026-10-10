import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),feature:vi.fn(),create:vi.fn(),find:vi.fn(),update:vi.fn(),findSaved:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:m.feature}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:async(_store:string,work:(tx:unknown)=>unknown)=>work({musicSubject:{create:m.create,findFirst:m.find,updateMany:m.update,findFirstOrThrow:m.findSaved}})}));
import {saveMusicSubjectWithReceipt} from "@/server/services/music-subject-save";
const input={name:"吉他",category:"",description:"",isActive:true,expectedStoreId:"store-a",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:"store-a",user:{id:"u"}});m.feature.mockResolvedValue({storeId:"store-a"});m.find.mockResolvedValue(null);m.create.mockImplementation(async({data})=>({...data,updatedAt:new Date("2026-10-10T00:00:00Z")}));});
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
it("still rejects unavailable music features",async()=>{
 m.feature.mockResolvedValue(null);await expect(saveMusicSubjectWithReceipt(input)).rejects.toThrow("僅適用音樂教室");expect(m.create).not.toHaveBeenCalled();
});
