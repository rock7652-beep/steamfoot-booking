// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({refresh:vi.fn(),read:vi.fn(),notify:null as null|((kind:string)=>void)}));
vi.mock("@/lib/music-finance-sync",()=>({isMusicPreviewPage:()=>true,subscribeMusicFinanceChange:(fn:(kind:string)=>void)=>{m.notify=fn;return()=>{m.notify=null;};}}));
import {useMusicCustomerPage} from "@/components/admin/use-music-customer-page";
const source={total:1,page:1,rows:[{id:"a",lastVisitAt:null,points:0,sessions:6}]};
let root:Root,host:HTMLDivElement;
function App({query="view=customers"}:{query?:string}){const result=useMusicCustomerPage(source,query,["a"],true,m.refresh);return React.createElement("output",null,result?.rows[0]?.sessions);}
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.refresh.mockReset();m.read.mockReset();vi.stubGlobal("fetch",m.read);host=document.createElement("div");root=createRoot(host);await act(async()=>root.render(React.createElement(App)));});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
it("updates the authoritative list balance without full page refresh; ignores receipts",async()=>{
 m.read.mockResolvedValue(Response.json({success:true,data:{...source,rows:[{...source.rows[0],sessions:10}]}}));
 await act(async()=>{m.notify!("receipt");});expect(m.read).not.toHaveBeenCalled();
 await act(async()=>{m.notify!("purchase");});expect(host.textContent).toBe("10");expect(m.refresh).not.toHaveBeenCalled();expect(m.read).toHaveBeenCalledWith(expect.stringContaining("view=customers"),expect.objectContaining({cache:"no-store"}));
});
it.each(["new-profile","failure"])("falls back safely for %s",async kind=>{
 m.read.mockResolvedValue(Response.json(kind==="failure"?{success:false}:{success:true,data:{...source,rows:[{...source.rows[0],id:"unknown"}]}}));
 await act(async()=>{m.notify!("purchase");});expect(m.refresh).toHaveBeenCalledOnce();expect(host.textContent).toBe("6");
});
it("discards older requests and results for a previous filter",async()=>{
 let resolve!:(value:Response)=>void;m.read.mockImplementation(()=>new Promise(r=>resolve=r));
 await act(async()=>{m.notify!("purchase");});await act(async()=>root.render(React.createElement(App,{query:"view=customers&search=B"})));
 await act(async()=>resolve(Response.json({success:true,data:{...source,rows:[{...source.rows[0],sessions:99}]}})));expect(host.textContent).toBe("6");expect(m.refresh).not.toHaveBeenCalled();
});
