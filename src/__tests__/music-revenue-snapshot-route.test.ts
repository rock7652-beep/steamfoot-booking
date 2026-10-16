import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),totals:vi.fn(),transactions:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.auth}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:m.scope}));
vi.mock("@/server/queries/course-home",()=>({getCourseReceiptTotals:m.totals}));
vi.mock("@/server/queries/music-revenue-transactions",()=>({getMusicRevenueTransactions:m.transactions}));
import {GET} from "@/app/(dashboard)/dashboard/music-revenue/route";
const input={from:"2026-10-01",to:"2026-10-16",dataScope:"legacy",status:"CONFIRMED",staff:"staff",page:"2"};
const req=(value:unknown=input)=>new Request("https://preview.example/music-revenue?"+new URLSearchParams({args:JSON.stringify([value])}));
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({storeId:"store-lubymusic"});m.scope.mockReturnValue(true);m.totals.mockResolvedValue({net:100});m.transactions.mockResolvedValue({rows:[],page:1,pages:1,count:0});});
it("authorizes once and returns both independent reads under the same store and filters",async()=>{
 const r=await GET(req());expect(r.status).toBe(200);expect(m.auth).toHaveBeenCalledExactlyOnceWith("transaction.read");
 expect(m.totals).toHaveBeenCalledWith("store-lubymusic",input.from,input.to,"legacy");
 expect(m.transactions).toHaveBeenCalledWith("store-lubymusic",input);
 expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("server-timing")).toContain("totals;dur=");
 expect(await r.json()).toMatchObject({success:true,data:{totals:{net:100},transactions:{rows:[]}}});
});
it.each([{...input,from:"2026-02-30"},{...input,from:"2026-10-17"},{...input,page:"-1"},{...input,dataScope:"all"}])("rejects invalid filters before reads",async(value)=>{expect((await GET(req(value))).status).toBe(400);expect(m.totals).not.toHaveBeenCalled();expect(m.transactions).not.toHaveBeenCalled();});
it("fails closed for authorization and non-preview stores",async()=>{
 m.auth.mockRejectedValueOnce(new Error("denied"));expect((await GET(req())).status).toBe(400);expect(m.totals).not.toHaveBeenCalled();
 m.scope.mockReturnValue(false);expect((await GET(req())).status).toBe(403);expect(m.transactions).not.toHaveBeenCalled();
});
it("does not return a mixed partial snapshot on failure",async()=>{m.transactions.mockRejectedValueOnce(new Error("offline"));const r=await GET(req());expect(r.status).toBe(400);expect(await r.json()).not.toHaveProperty("data");});
