// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({reader:{read:vi.fn(),invalidate:vi.fn()},signal:()=>{},listeners:0}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>m.reader}));
vi.mock("@/lib/music-finance-sync",()=>({subscribeMusicFinanceChange:(fn:()=>void)=>{m.signal=fn;m.listeners++;return()=>{m.listeners--;};}}));
vi.mock("@/components/desktop",()=>({KpiStrip:()=>null}));
import {MusicRevenueLive,useMusicRevenueLive} from "@/components/admin/music-revenue-live";
import {MusicRevenueMetrics} from "@/components/admin/music-revenue-metrics";
function Rows(){const state=useMusicRevenueLive();return createElement("span",null,`rows:${state?.data.transactions.count}`);}
it("shares one read, updates totals and rows together and rejects older responses",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div"),root=createRoot(host);
 const totals=(net:number)=>({purchases:net,purchaseCount:1,trial:0,refunds:0,voids:0,gross:net,net});
 const data=(net:number)=>({totals:totals(net),transactions:{rows:[],count:net,page:1,pages:1}});
 const resolvers:Array<(v:unknown)=>void>=[];m.reader.read.mockImplementation(()=>new Promise(r=>resolvers.push(r)));
 try{
 await act(async()=>root.render(createElement(MusicRevenueLive,{initial:data(0),input:{from:"2026-10-01",to:"2026-10-16",dataScope:"operational",page:"2"},enabled:true,children:[createElement(MusicRevenueMetrics,{key:"metrics",initial:totals(0),from:"2026-10-01",to:"2026-10-16"}),createElement(Rows,{key:"rows"})]})));
 expect(m.listeners).toBe(1);await act(async()=>m.signal());expect(m.reader.read).toHaveBeenCalledTimes(1);
 expect(m.reader.read).toHaveBeenLastCalledWith(expect.objectContaining({page:"2",dataScope:"operational"}));
 await act(async()=>m.signal());await act(async()=>resolvers[1]({success:true,data:data(3200)}));
 expect(host.textContent).toContain("淨收款 NT$ 3,200");expect(host.textContent).toContain("rows:3200");
 await act(async()=>resolvers[0]({success:true,data:data(1000)}));expect(host.textContent).toContain("淨收款 NT$ 3,200");expect(host.textContent).toContain("rows:3200");
 }finally{await act(async()=>root.unmount());}expect(m.listeners).toBe(0);
});
