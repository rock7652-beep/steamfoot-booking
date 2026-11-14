// @vitest-environment jsdom
import {it,expect,vi,afterEach} from "vitest";
const m=vi.hoisted(()=>({summary:vi.fn()}));
vi.mock("@/server/actions/customer-panel-summary",()=>({getCustomerPanelSummary:m.summary}));
import {GET} from "@/app/(dashboard)/dashboard/customers/summary-read/route";
import {readCustomerPanelSummary} from "@/lib/customer-panel-summary-read";
afterEach(()=>{vi.unstubAllGlobals();m.summary.mockReset();});
it("rejects invalid identifiers before invoking the authorized reader",async()=>{
 const response=await GET(new Request("https://test/dashboard/customers/summary-read"));
 expect(response.status).toBe(400);expect(m.summary).not.toHaveBeenCalled();
 expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("delegates to the permission checked reader and never caches a denied result",async()=>{
 m.summary.mockResolvedValue({success:false,error:"顧客不存在"});
 const response=await GET(new Request("https://test/dashboard/customers/summary-read?customerId=other&storeId=untrusted"));
 expect(m.summary).toHaveBeenCalledWith("other");expect(await response.json()).toEqual({success:false,error:"顧客不存在"});
 expect(response.headers.get("Vary")).toBe("Cookie");expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("reads the scoped route independently with no-store and restores appointment dates",async()=>{
 window.history.replaceState(null,"","/s/fixture/admin/dashboard/customers");
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,data:{next:{date:"2026-11-15T00:00:00.000Z",time:"10:00"}}})});vi.stubGlobal("fetch",fetch);
 const controller=new AbortController();const result=await readCustomerPanelSummary("a&b",controller.signal);
 expect(fetch).toHaveBeenCalledWith("/s/fixture/admin/dashboard/customers/summary-read?customerId=a%26b",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
 expect(result.success&&result.data.next?.date).toBeInstanceOf(Date);
});
