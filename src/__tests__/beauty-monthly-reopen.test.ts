// @vitest-environment jsdom
import {createElement,act,type ReactNode} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("@/server/actions/beauty-native-transactions",()=>({confirmBeautyNativeSettlement:m.save}));
vi.mock("@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client",()=>({
 CourseMonthlyReport:({confirm}:{confirm:ReactNode})=>createElement("div",null,confirm),
 CourseMonthlyConfirm:({month,fingerprint,source}:{month:string;fingerprint:string;source:{save:(input:{month:string;fingerprint:string})=>Promise<unknown>}})=>createElement("button",{onClick:()=>source.save({month,fingerprint})},"確認"),
}));
import {BeautyNativeFeeReport} from "@/components/beauty/native-fee-source";
it("reuses a request for retries and creates a fresh request after reopening an unchanged month",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const props={storeId:"A",month:"2026-11",fingerprint:"a".repeat(64),lines:[{kind:"FEE" as const,id:"service",staffId:"tech",name:"技師",label:"服務",date:"2026-11-04",amount:500,paid:0,issue:null,payments:[]}],confirmed:false,previous:true,canConfirm:true};
 m.save.mockResolvedValue({success:true});
 try {
 await act(async()=>root.render(createElement(BeautyNativeFeeReport,{...props,lockRevision:1})));
 await act(async()=>host.querySelector("button")!.click());await act(async()=>host.querySelector("button")!.click());
 expect(m.save.mock.calls[0][0].requestKey).toBe(m.save.mock.calls[1][0].requestKey);
 await act(async()=>root.render(createElement(BeautyNativeFeeReport,{...props,lockRevision:3})));
 await act(async()=>host.querySelector("button")!.click());
 expect(m.save.mock.calls[2][0]).toMatchObject({expectedLockRevision:3,fingerprint:props.fingerprint});
 expect(m.save.mock.calls[2][0].requestKey).not.toBe(m.save.mock.calls[0][0].requestKey);
 }finally{await act(async()=>root.unmount());host.remove();}
});
