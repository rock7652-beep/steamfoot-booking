import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m=vi.hoisted(()=>({auth:vi.fn(),permission:vi.fn(),store:vi.fn(),view:vi.fn(),feature:vi.fn(),exportFeature:vi.fn(),module:vi.fn(),plan:vi.fn(),limit:vi.fn(),analytics:vi.fn()}));
vi.mock("@/lib/auth",()=>({auth:m.auth}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"cookie-store"})})}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveActiveStoreId:m.store}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:m.view}));
vi.mock("@/lib/data-export-gate",()=>({requireDataExportFeature:m.exportFeature}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.plan}));
vi.mock("@/lib/usage-gate",()=>({checkReportLimit:m.limit}));
vi.mock("@/server/queries/course-analytics",()=>({getCourseAnalytics:m.analytics}));
import { GET } from "@/app/api/export/course-analysis/route";
const request=()=>new NextRequest("https://example.test/api/export/course-analysis?startDate=2026-09-17&endDate=2026-09-17&storeId=foreign");
beforeEach(()=>{
 vi.resetAllMocks();m.auth.mockResolvedValue({user:{role:"OWNER",staffId:"manager"}});m.permission.mockResolvedValue(true);m.store.mockResolvedValue("authorized");m.view.mockResolvedValue(null);m.exportFeature.mockResolvedValue(null);m.feature.mockResolvedValue(true);m.module.mockResolvedValue("course");m.plan.mockResolvedValue({id:"authorized"});m.limit.mockReturnValue({allowed:true});
 m.analytics.mockResolvedValue({current:{sessions:2,participants:1,participations:2,visitors:["b"],completed:2,newVisitors:["b"],returningVisitors:[],pointsUsed:3,sessionsUsed:1,checkedIn:0,noShow:0,coaches:[{id:"coach",sessions:2,completed:2}]},previous:{startDate:"2026-09-16",endDate:"2026-09-16"},returned:[],revenue:null,staff:[{id:"coach",displayName:"=FORMULA"}]});
});
describe("course analysis export authorization",()=>{
 it("uses the authorized store, not URL storeId, and escapes spreadsheet formulas",async()=>{
  const result=await GET(request());expect(result.status).toBe(200);
  expect(m.analytics).toHaveBeenCalledWith("authorized",{startDate:"2026-09-17",endDate:"2026-09-17"},true);
  const csv=await result.text();expect(csv).toContain('"使用點數","3"');expect(csv).toContain('"使用堂數","1"');expect(csv).toContain("'=FORMULA");
 });
 it("rejects unauthenticated and permission-denied downloads",async()=>{
  m.auth.mockResolvedValueOnce(null);expect((await GET(request())).status).toBe(401);
  m.permission.mockResolvedValueOnce(false);expect((await GET(request())).status).toBe(403);expect(m.analytics).not.toHaveBeenCalled();
 });
 it("blocks view mode, wrong module, and existing quota restrictions",async()=>{
  m.view.mockResolvedValueOnce({isViewMode:true});expect((await GET(request())).status).toBe(403);
  m.module.mockResolvedValueOnce("steamfoot");expect((await GET(request())).status).toBe(403);
  m.limit.mockReturnValueOnce({allowed:false});expect((await GET(request())).status).toBe(403);expect(m.analytics).not.toHaveBeenCalled();
 });
 it("does not read financial data without transaction permission",async()=>{
  m.permission.mockImplementation(async(_role,_staff,permission)=>permission!=="transaction.read");
  expect((await GET(request())).status).toBe(200);expect(m.analytics).toHaveBeenCalledWith("authorized",expect.any(Object),false);
 });
 it("rejects invalid dates before querying the report",async()=>{
  expect((await GET(new NextRequest("https://example.test/api/export/course-analysis?startDate=2026-02-30&endDate=2026-03-01"))).status).toBe(400);expect(m.analytics).not.toHaveBeenCalled();
 });
});
