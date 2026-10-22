import { expect, it, vi } from "vitest";
import { memoizeReadRequest, withReadRequestMemo } from "@/server/services/read-request-memo";
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
it("deduplicates concurrent and completed lookups only within one opted-in read request", async () => {
 const read = vi.fn(async () => ({ actor: "a" }));
 await withReadRequestMemo(async () => {
  const [a,b]=await Promise.all([memoizeReadRequest("user",read),memoizeReadRequest("user",read)]);
  expect(a).toBe(b); expect(await memoizeReadRequest("user",read)).toBe(a); expect(read).toHaveBeenCalledOnce();
 });
 await withReadRequestMemo(()=>memoizeReadRequest("user",read)); expect(read).toHaveBeenCalledTimes(2);
});
it("does not share identity or store results across overlapping HTTP requests", async () => {
 const gate=deferred();
 const run=(actor:string)=>withReadRequestMemo(async()=>{const read=vi.fn(async()=>{await gate.promise;return actor;}); const result=await Promise.all([memoizeReadRequest("user",read),memoizeReadRequest("user",read)]);expect(read).toHaveBeenCalledOnce();return result;});
 const a=run("owner-a"),b=run("owner-b");gate.resolve();expect(await a).toEqual(["owner-a","owner-a"]);expect(await b).toEqual(["owner-b","owner-b"]);
});
it("keeps ordinary SSR/action/write calls unchanged outside the opt-in scope", async () => {
 const read=vi.fn(async()=>true);await memoizeReadRequest("user",read);await memoizeReadRequest("user",read);expect(read).toHaveBeenCalledTimes(2);
});
it("does not retain failures into another request or confuse actor/store keys", async () => {
 const error=vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue("new session");
 await expect(withReadRequestMemo(()=>memoizeReadRequest("user",error))).rejects.toThrow("denied");
 expect(await withReadRequestMemo(()=>memoizeReadRequest("user",error))).toBe("new session");
 await withReadRequestMemo(async()=>{expect(await memoizeReadRequest("store:a",async()=>"a")).toBe("a");expect(await memoizeReadRequest("store:b",async()=>"b")).toBe("b");});
});
