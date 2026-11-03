// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({reader:{read:vi.fn(),invalidate:vi.fn()},signal:()=>{}}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>m.reader}));
vi.mock("@/lib/music-finance-sync",()=>({subscribeMusicFinanceChange:(fn:()=>void)=>{m.signal=fn;return()=>{};}}));
vi.mock("@/components/desktop",()=>({KpiStrip:()=>null}));
import {MusicRevenueMetrics} from "@/components/admin/music-revenue-metrics";
it("shows authoritative newer totals without waiting for the page and discards older in-flight replies",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div"),root=createRoot(host);
 const totals=(net:number)=>({purchases:net,purchaseCount:1,trial:0,refunds:0,voids:0,gross:net,net});
 const resolvers:Array<(value:unknown)=>void>=[];m.reader.read.mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)));
 try{
 await act(async()=>root.render(createElement(MusicRevenueMetrics,{initial:totals(0),from:"2026-10-01",to:"2026-10-16"})));
 await act(async()=>m.signal());await act(async()=>m.signal());
 await act(async()=>resolvers[1]({success:true,data:totals(3200)}));expect(host.textContent).toContain("淨收款 NT$ 3,200");
 await act(async()=>resolvers[0]({success:true,data:totals(1000)}));expect(host.textContent).toContain("淨收款 NT$ 3,200");
 }finally{await act(async()=>root.unmount());}
});
