import {it,expect,vi,afterEach} from "vitest";
const state=vi.hoisted(()=>({preview:true}));
vi.mock("@/lib/music-finance-sync",()=>({isMusicPreviewPage:()=>state.preview}));
import {musicPanelRead} from "@/lib/music-panel-transport";
afterEach(()=>{vi.unstubAllGlobals();state.preview=true;});
it("starts independent reads concurrently without invoking action fallbacks",async()=>{
 const resolve:Array<(r:unknown)=>void>=[];
 const fetcher=vi.fn((_url:string,_options:RequestInit)=>new Promise(r=>resolve.push(r)));vi.stubGlobal("fetch",fetcher);
 const fallback=vi.fn();
 const first=musicPanelRead("music-student-workspace",["learner"],fallback);
 const second=musicPanelRead("course-card",[{customerId:"learner"}],fallback);
 expect(fetcher).toHaveBeenCalledTimes(2);expect(fallback).not.toHaveBeenCalled();
 for(const done of resolve)done(new Response(JSON.stringify({success:true}),{headers:{"Content-Type":"application/json"}}));
 await Promise.all([first,second]);
 expect(fetcher.mock.calls[0][1]).toMatchObject({cache:"no-store",credentials:"same-origin"});
});
it("does not queue the learner makeup read as a server action",async()=>{
 const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({success:true,data:null}),{headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetcher);const fallback=vi.fn();
 await musicPanelRead("music-student-makeups",["learner","operational"],fallback);
 expect(fetcher).toHaveBeenCalledOnce();expect(String(fetcher.mock.calls[0][0])).toContain("operation=music-student-makeups");expect(fallback).not.toHaveBeenCalled();
});
it("uses independent reads for the customer search index",async()=>{
 const fetcher=vi.fn(async(url:string)=>{expect(url).toContain("operation=course-customer-search-index");return new Response(JSON.stringify({success:true,rows:[]}),{headers:{"Content-Type":"application/json"}});});vi.stubGlobal("fetch",fetcher);const fallback=vi.fn();
 await musicPanelRead("course-customer-search-index",[],fallback);expect(fetcher).toHaveBeenCalledOnce();expect(fallback).not.toHaveBeenCalled();
});
it("keeps other environments on existing authorized readers",async()=>{
 state.preview=false;const fallback=vi.fn(async()=>({success:true}));const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 await musicPanelRead("course-card",[],fallback);expect(fallback).toHaveBeenCalledOnce();expect(fetcher).not.toHaveBeenCalled();
});
it("does not silently retry failed reads with a second action request",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>({ok:false})));const fallback=vi.fn();
 await expect(musicPanelRead("course-card",[],fallback)).rejects.toThrow();expect(fallback).not.toHaveBeenCalled();
});
