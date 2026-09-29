import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({feature:vi.fn(),permission:vi.fn(),raw:vi.fn()}));
vi.mock("react",()=>({cache:(fn:unknown)=>fn}));
vi.mock("@/lib/db",()=>({prisma:{$queryRaw:m.raw,storeFeatureEntitlement:{findFirst:m.feature}}}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
import {canMusicFinance,requireMusicFinance} from "@/server/services/music-finance-access";
const actor={role:"OWNER" as const,staffId:"manager"};
beforeEach(()=>{vi.resetAllMocks();m.feature.mockResolvedValue({storeId:"A"});m.permission.mockResolvedValue(false);m.raw.mockResolvedValue([{teacherIds:null}]);});
it("learner checkout does not imply access to teacher pay",async()=>{expect(await canMusicFinance(actor,"A","teacher.settlement.read")).toBe(false);await expect(requireMusicFinance(actor,"A","teacher.settlement.pay")).rejects.toThrow("尚未授權");});
it("checks explicit permissions and store-scoped entitlement",async()=>{m.permission.mockResolvedValue(true);expect(await canMusicFinance(actor,"A","teacher.compensation.manage")).toBe(true);expect(m.permission).toHaveBeenCalledWith("OWNER","manager","teacher.compensation.manage");expect(m.feature.mock.calls[0][0].where.storeId).toBe("A");});
it("does not change the sports authorization contract",async()=>{m.feature.mockResolvedValue(null);expect(await canMusicFinance(actor,"sports","teacher.settlement.read")).toBe(true);expect(m.permission).not.toHaveBeenCalled();});
it("authorization failures never reuse a prior successful answer",async()=>{m.permission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);expect(await canMusicFinance(actor,"A","teacher.settlement.pay")).toBe(true);await expect(requireMusicFinance(actor,"A","teacher.settlement.pay")).rejects.toThrow();});
it("selected scope denies other teachers and aggregate mutations",async()=>{
 m.permission.mockResolvedValue(true);m.raw.mockResolvedValue([{teacherIds:["teacher-a"]}]);
 expect(await canMusicFinance(actor,"A","teacher.compensation.read","teacher-a")).toBe(true);
 expect(await canMusicFinance(actor,"A","teacher.compensation.read","teacher-b")).toBe(false);
 await expect(requireMusicFinance(actor,"A","teacher.settlement.confirm")).rejects.toThrow();
 await expect(requireMusicFinance(actor,"A","teacher.settlement.pay","teacher-a")).resolves.toBeUndefined();
});
it("empty, inactive and cross-store staff scopes never authorize",async()=>{
 m.permission.mockResolvedValue(true);m.raw.mockResolvedValue([]);
 expect(await canMusicFinance(actor,"B","teacher.settlement.read","teacher-a")).toBe(false);
 expect(m.raw.mock.calls[0].slice(1)).toEqual(["manager","B"]);
 m.raw.mockResolvedValue([{teacherIds:[]}]);
 expect(await canMusicFinance(actor,"A","teacher.settlement.read")).toBe(false);
});
it("scope revocation is immediate on the next call",async()=>{
 m.permission.mockResolvedValue(true);m.raw.mockResolvedValueOnce([{teacherIds:["teacher-a"]}]).mockResolvedValueOnce([{teacherIds:[]}]);
 expect(await canMusicFinance(actor,"A","teacher.settlement.read","teacher-a")).toBe(true);
 expect(await canMusicFinance(actor,"A","teacher.settlement.read","teacher-a")).toBe(false);
});
