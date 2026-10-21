import { beforeEach, expect, it, vi } from "vitest";
const save=vi.hoisted(()=>({close:vi.fn(),reopen:vi.fn(),create:vi.fn()}));
vi.mock("@/server/actions/cash-drawer",()=>({closeCashDrawerAction:save.close,reopenCashDrawerAction:save.reopen}));
vi.mock("@/server/services/cash-drawer-form",()=>({createCashDrawerCashbookEntry:save.create}));
import { POST } from "@/app/(dashboard)/dashboard/cash-drawer/save/route";
beforeEach(()=>{vi.clearAllMocks();for(const fn of Object.values(save))fn.mockResolvedValue({success:false,error:"權限不足"});});
function request(kind:string,origin="https://review.example",extras:Record<string,string>={}){const form=new FormData();form.set("kind",kind);for(const [k,v]of Object.entries(extras))form.set(k,v);return new Request("https://review.example/dashboard/cash-drawer/save",{method:"POST",headers:{Origin:origin},body:form});}
it.each(["https://other.example", "null", ""])("rejects an untrusted Origin before invoking financial actions: %s",async origin=>{
 expect((await POST(request("CLOSE",origin))).status).toBe(403);for(const fn of Object.values(save))expect(fn).not.toHaveBeenCalled();
});
it("does not turn permission rejection into a successful receipt",async()=>{
 const response=await POST(request("CLOSE",undefined,{sessionId:"foreign-session",closingActualCash:"123"}));
 expect(response.status).toBe(400);expect(await response.json()).toEqual({success:false,error:"權限不足"});
 expect(save.close).toHaveBeenCalledWith({sessionId:"foreign-session",closingActualCash:123,note:undefined});
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns a finite receipt while preserving original requestId and closed-day confirmation",async()=>{
 save.create.mockResolvedValue({success:true,data:{entryId:"one-receipt"}});
 const response=await POST(request("CASHBOOK",undefined,{requestId:"fixed-attempt",confirmClosedCashbookChange:"on",entryDate:"2026-10-20"}));
 expect(await response.json()).toEqual({success:true,data:{entryId:"one-receipt"}});
 const form=save.create.mock.calls[0][0] as FormData;expect(form.get("requestId")).toBe("fixed-attempt");expect(form.get("entryDate")).toBe("2026-10-20");expect(form.get("confirmClosedCashbookChange")).toBe("on");
});
it("rejects unknown operations and file uploads before business code",async()=>{
 expect((await POST(request("DELETE"))).status).toBe(400);
 const form=new FormData();form.set("kind","CASHBOOK");form.set("note",new Blob(["not a text field"]),"file.txt");
 expect((await POST(new Request("https://review.example/dashboard/cash-drawer/save",{method:"POST",headers:{Origin:"https://review.example"},body:form}))).status).toBe(400);
 for(const fn of Object.values(save))expect(fn).not.toHaveBeenCalled();
});
