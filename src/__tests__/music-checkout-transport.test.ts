import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { musicCheckoutTransport } from "@/lib/music-checkout-transport";
const { enabled, notify, early } = vi.hoisted(() => ({ enabled:vi.fn(), notify:vi.fn(), early:vi.fn() }));
vi.mock("@/lib/music-finance-sync",()=>({isMusicPreviewPage:enabled,publishMusicFinanceChange:notify,publishMusicRevenueCommit:early}));
beforeEach(()=>{vi.clearAllMocks();enabled.mockReturnValue(true);});
afterEach(()=>vi.unstubAllGlobals());
describe("deployment independent music checkout",()=>{
 it("posts the exact idempotency key to a stable route and notifies only after success",async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({success:true}));vi.stubGlobal("fetch",fetcher);
  const fallback=vi.fn();const input={requestKey:"same-key",amount:200};
  expect(await musicCheckoutTransport("receipt",input,fallback)).toEqual({success:true});
  expect(fallback).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith("/s/lubymusic/admin/dashboard/music-checkout",expect.objectContaining({cache:"no-store",body:JSON.stringify({operation:"receipt",input})}));
  expect(notify).toHaveBeenCalledOnce();
 });
 it("never retries or falls back after an uncertain payment result",async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error("offline"));vi.stubGlobal("fetch",fetcher);const fallback=vi.fn();
  expect((await musicCheckoutTransport("receipt",{},fallback)).success).toBe(false);
  expect(fetcher).toHaveBeenCalledOnce();expect(fallback).not.toHaveBeenCalled();expect(notify).not.toHaveBeenCalled();
 });
 it("preserves the draft on an unsupported contract and does not notify",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(null,{status:409})));
  expect((await musicCheckoutTransport("purchase",{},vi.fn())).error).toContain("輸入仍保留");expect(notify).not.toHaveBeenCalled();
 });
 it("retains existing transport outside preview",async()=>{
  enabled.mockReturnValue(false);const fallback=vi.fn().mockResolvedValue({success:true});
  await musicCheckoutTransport("purchase",{a:1},fallback);expect(fallback).toHaveBeenCalledWith({a:1});expect(notify).not.toHaveBeenCalled();
 });
});
it("starts revenue after committed headers, before projection, with the same deduplication token",async()=>{
 let resolve!:(value:unknown)=>void;
 const json=vi.fn(()=>new Promise(r=>{resolve=r;}));
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers({"x-music-committed":"1"}),json}));
 const pending=musicCheckoutTransport("purchase",{},vi.fn());
 await vi.waitFor(()=>expect(early).toHaveBeenCalledOnce());
 expect(notify).not.toHaveBeenCalled();
 resolve({success:true});expect((await pending).success).toBe(true);
 expect(notify).toHaveBeenCalledWith("purchase",early.mock.calls[0][0]);
});
it("retains confirmed success when the projection stream disconnects",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,headers:new Headers({"x-music-committed":"1"}),json:vi.fn().mockRejectedValue(new Error("disconnected"))}));
 expect(await musicCheckoutTransport("purchase",{},vi.fn())).toEqual({success:true});
 expect(early).toHaveBeenCalledOnce();expect(notify).toHaveBeenCalledOnce();
});
