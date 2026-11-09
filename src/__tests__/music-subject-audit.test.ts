import {beforeEach, expect, it, vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),read:vi.fn(),enqueue:vi.fn(),raw:vi.fn(),find:vi.fn()}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:async()=>true}));
vi.mock("@/lib/db",()=>({prisma:{storeFeatureEntitlement:{findFirst:async()=>({storeId:"own"})}}}));
vi.mock("@/server/services/sports-production-readiness",()=>({assertSportsProductionReady:async()=>{}}));
vi.mock("@/server/services/sports-teaching-rule",()=>({saveSportsTeachingRule:m.save,readSportsTeachingRule:m.read}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:m.enqueue}));
vi.mock("@/server/services/course-access",()=>({courseManager:async()=>({storeId:"own",user:{id:"actor",role:"OWNER"}}),courseTransaction:async(_s:string,fn:(tx:unknown)=>unknown)=>fn({$queryRaw:m.raw,musicSubject:{findFirst:m.find,create:async({data}:{data:object})=>({...data,updatedAt:new Date("2026-11-06T00:00:00Z")})}})}));
import {saveMusicSubjectWithReceipt} from "@/server/services/music-subject-save";
import {auditChanges} from "@/lib/audit-presentation";
const input={name:"瑜珈",category:"",description:"",isActive:true,expectedStoreId:"own",requestKey:"123e4567-e89b-42d3-a456-426614174000",sportsRule:{pointCost:3,coachIds:["new"],expectedCoachIds:["old"],compensation:{mode:"SHARE",value:60},expectedCompensation:{mode:"SHARE",value:50}}};
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(null);m.save.mockResolvedValue({pointCost:2,coachIds:["old"],compensation:{mode:"SHARE",value:50},expectedCompensation:{mode:"SHARE",value:50}});m.raw.mockResolvedValue([{id:"old",name:"老師甲"},{id:"new",name:"老師乙"}]);m.read.mockResolvedValue(input.sportsRule);});
it("records the locked prior rule and saves readable coach and fee snapshots",async()=>{
 await saveMusicSubjectWithReceipt(input);
 const audit=m.enqueue.mock.calls[0][0];
 expect(audit).toMatchObject({actorUserId:"actor",storeId:"own",summary:"設定「瑜珈」授課資格與計酬",before:{coachNames:["老師甲"],rules:[{mode:"SHARE",value:50}]},after:{coachNames:["老師乙"],rules:[{mode:"SHARE",value:60}]}});
 expect(auditChanges(audit.before,audit.after)).toEqual([{label:"使用點數",before:"2",after:"3"},{label:"可授課教練",before:"老師甲",after:"老師乙"},{label:"計酬方式",before:"授課人員分得 50%",after:"授課人員分得 60%"}]);
 expect(m.raw.mock.calls[0].slice(1)).toEqual(["own",["old","new"]]);
});
it("does not enqueue a duplicate event on a confirmed retry",async()=>{
 m.find.mockResolvedValue({...input,id:"saved",updatedAt:new Date("2026-11-06T00:00:00Z")});
 await saveMusicSubjectWithReceipt(input);
 expect(m.enqueue).not.toHaveBeenCalled();
 expect(m.save).toHaveBeenCalledWith(expect.anything(),"own",expect.anything(),expect.anything(),true);
});
