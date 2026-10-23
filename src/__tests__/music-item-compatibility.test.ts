import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:(id:string)=>id==="preview"}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:(id:string)=>id==="preview"}));
import {courseCardMatchesItem} from "@/server/services/music-item-compatibility";
import type {Prisma} from "../../generated/course-client";
const findFirst=vi.fn(),findMany=vi.fn();
const tx={courseTemplate:{findFirst,findMany}} as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.resetAllMocks();findFirst.mockResolvedValue({musicSubjectId:"A",classType:"PRIVATE",musicTrialMode:null});findMany.mockResolvedValue([{id:"A1"},{id:"A2"}]);});
describe("music item eligibility",()=>{
 it("accepts A1 and A2 for item A without rewriting purchased cards",async()=>{
  expect(await courseCardMatchesItem(tx,"preview",["A1"],"A2")).toBe(true);
  expect(findMany).toHaveBeenCalledWith({where:{storeId:"preview",musicSubjectId:"A",musicTrialMode:null},select:{id:true}});
 });
 it("rejects B cards for A",async()=>expect(await courseCardMatchesItem(tx,"preview",["B1","B2"],"A2")).toBe(false));
 it("keeps other stores on their existing exact-template behavior",async()=>{
  expect(await courseCardMatchesItem(tx,"production",["A1"],"A2")).toBe(false);expect(findFirst).not.toHaveBeenCalled();
 });
 it("does not broaden a legacy template with no item mapping",async()=>{findFirst.mockResolvedValue({musicSubjectId:null});expect(await courseCardMatchesItem(tx,"preview",["A1"],"A2")).toBe(false);});
});
