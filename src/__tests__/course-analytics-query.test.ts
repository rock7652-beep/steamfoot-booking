import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({scope:vi.fn(),sessions:vi.fn(),firsts:vi.fn(),staff:vi.fn(),revenue:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({requireCourseStore:m.scope}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({courseSession:{findMany:m.sessions},$queryRaw:m.firsts})}}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findMany:m.staff}}}));
vi.mock("@/server/queries/course-revenue-report",()=>({getCourseRevenueReport:m.revenue}));
import {getCourseAnalytics} from "@/server/queries/course-analytics";
beforeEach(()=>{vi.resetAllMocks();m.sessions.mockResolvedValue([]);m.firsts.mockResolvedValue([]);m.staff.mockResolvedValue([]);m.revenue.mockResolvedValue({kpi:{netRevenue:0}});});
it("scopes sessions, nested bookings, earliest attendance and staff to the course store",async()=>{
 await getCourseAnalytics("store",{startDate:"2026-09-17",endDate:"2026-09-17"},true);
 expect(m.scope).toHaveBeenCalledWith("store");
 expect(m.sessions).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:"store",cancelledAt:null}),select:expect.objectContaining({bookings:expect.objectContaining({where:{storeId:"store"}})})}));
 expect(m.firsts.mock.calls[0].slice(1)).toEqual(["store"]);
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"store"}}));
 for(const call of m.revenue.mock.calls){expect(call[0]).toBe("store");expect(call[1].storeFilter).toEqual({storeId:"store"});}
});
it("does not query revenue when financial visibility is denied",async()=>{
 const result=await getCourseAnalytics("store",{startDate:"2026-09-17",endDate:"2026-09-17"},false);
 expect(result.revenue).toBeNull();expect(m.revenue).not.toHaveBeenCalled();expect(result.trend).toHaveLength(6);
});
it("rejects a non-course store before querying any course records",async()=>{
 m.scope.mockRejectedValueOnce(new Error("scope"));await expect(getCourseAnalytics("store",{startDate:"2026-09-17",endDate:"2026-09-17"},true)).rejects.toThrow("scope");expect(m.sessions).not.toHaveBeenCalled();
});
