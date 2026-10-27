import { afterEach, expect, it, vi } from "vitest";
import { measureLiffClientPhase } from "@/lib/liff/client-timing";
afterEach(()=>vi.unstubAllGlobals());
it("records only fixed local phase names and numeric elapsed boundaries",async()=>{
 const measure=vi.fn();vi.stubGlobal("performance",{now:vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(24),measure});
 expect(await measureLiffClientPhase("session_exchange",async()=>"private-return-value")).toBe("private-return-value");
 expect(measure).toHaveBeenCalledWith("liff:session_exchange",{start:10,end:24});
 expect(JSON.stringify(measure.mock.calls)).not.toContain("private-return-value");
});
it("preserves results on unsupported embedded performance APIs",async()=>{
 vi.stubGlobal("performance",{now:()=>0,measure:()=>{throw Error("unsupported")}});
 expect(await measureLiffClientPhase("sdk_init",async()=>7)).toBe(7);
});
it("does not turn a failed authentication operation into success",async()=>{
 await expect(measureLiffClientPhase("session_exchange",async()=>{throw Error("verification failed")})).rejects.toThrow("verification failed");
});
it("continues if the performance clock itself is unavailable",async()=>{
 vi.stubGlobal("performance",{now:()=>{throw Error("unsupported clock")}});
 expect(await measureLiffClientPhase("sdk_init",async()=>7)).toBe(7);
});
