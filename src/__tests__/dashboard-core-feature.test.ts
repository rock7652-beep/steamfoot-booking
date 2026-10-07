import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const m=vi.hoisted(()=>({session:vi.fn(),store:vi.fn(),feature:vi.fn()}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.session}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.store}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
import {requireDashboardCoreFeature} from "@/lib/dashboard-core-feature";
beforeEach(()=>{vi.resetAllMocks();m.session.mockResolvedValue({role:"ADMIN",id:"hq"});m.store.mockResolvedValue("store-a");});
it.each(["basic_booking","customer_management","plan_management"] as const)("enforces hidden/locked %s before page content",async feature=>{
 m.feature.mockRejectedValue(new Error("feature denied"));
 await expect(requireDashboardCoreFeature(feature)).rejects.toThrow("feature denied");
 expect(m.feature).toHaveBeenCalledWith("store-a",feature);
});
function pages(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?pages(join(dir,entry.name)):entry.name==="page.tsx"?[join(dir,entry.name)]:[]);}
it("places independent guards on every core page including nested new/edit routes",()=>{
 for(const [dir,feature] of [["bookings","basic_booking"],["customers","customer_management"],["plans","plan_management"],["spa-schedule","basic_booking"]]) {
  for(const file of pages(`src/app/(dashboard)/dashboard/${dir}`))expect(readFileSync(file,"utf8"),file).toContain(`await requireDashboardCoreFeature("${feature}")`);
 }
});
it("gates unknown course views as the actual schedule fallback",()=>{
 const source=readFileSync("src/app/(dashboard)/dashboard/courses/page.tsx","utf8");
 expect(source).toContain('["analytics", "settings", "operations"].includes(query.view ?? "") ? undefined : FEATURES.BASIC_BOOKING');
});
