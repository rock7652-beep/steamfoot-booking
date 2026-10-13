import { afterEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),customer:vi.fn(),guard:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock("../../scripts/store-member-workorder-review-gate.mjs",()=>({STORE_MEMBER_WORKORDER_REVIEW_BRANCH:"feat/store-member-link-workorder-line-20261012",assertStoreMemberWorkorderReviewOnly:m.guard}));
import { POST } from "@/app/api/qa/member-workorder/route";
import { NextRequest } from "next/server";
const request=()=>new NextRequest("https://fixture.invalid/api/qa/member-workorder",{method:"POST",body:JSON.stringify({op:"capture"})});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
describe("isolated QA endpoint boundaries",()=>{
 it("production is absent before auth and database reads",async()=>{vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");expect((await POST(request())).status).toBe(404);expect(m.permission).not.toHaveBeenCalled();expect(m.customer).not.toHaveBeenCalled();});
 it("refuses a regular staff account before customer reads",async()=>{vi.stubEnv("VERCEL_GIT_COMMIT_REF","feat/store-member-link-workorder-line-20261012");m.permission.mockResolvedValue({id:"real-staff",storeId:"s"});expect((await POST(request())).status).toBe(403);expect(m.customer).not.toHaveBeenCalled();});
 it("only resolves the signed actor's exact synthetic customer",async()=>{vi.stubEnv("VERCEL_GIT_COMMIT_REF","feat/store-member-link-workorder-line-20261012");m.permission.mockResolvedValue({id:"qa-member-workorder-20261012:actor",storeId:"s"});m.customer.mockResolvedValue(null);expect((await POST(request())).status).toBe(404);expect(m.customer).toHaveBeenCalledWith(expect.objectContaining({where:{id:"qa-member-workorder-20261012:s",storeId:"s"}}));});
});
