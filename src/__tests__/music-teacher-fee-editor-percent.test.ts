// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {MusicTeacherFeeEditor} from "@/components/admin/music-teacher-fee-editor";

it("uses percentages while keeping the stored default ratio and exception rule units",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const onSettings=vi.fn(),onFees=vi.fn();
 const props={templates:[{id:"p",name:"鋼琴"}],qualificationIds:["p"],fees:{},settings:{defaultRatio:0.29,subjectRules:{},revision:1},onSettings,onFees,onQualification:vi.fn()};
 async function change(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
 try {
  await act(async()=>root.render(createElement(MusicTeacherFeeEditor,props)));
  const input=host.querySelector<HTMLInputElement>('[aria-label="老師全科預設比例"]')!;
  expect(input.value).toBe("29");expect(input.max).toBe("100");
  await change(input,"40");expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({defaultRatio:0.4}));
  await change(input,"0");expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({defaultRatio:0}));
  await change(input,"");expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({defaultRatio:null}));
  await act(async()=>root.unmount());const flexRoot=createRoot(host);
  try {
   await act(async()=>flexRoot.render(createElement(MusicTeacherFeeEditor,{...props,fees:{p:{mode:"SHARE",value:"55",revision:1}}})));
   const exception=host.querySelector<HTMLInputElement>('[aria-label="鋼琴拆帳數值"]')!;
   expect(exception.value).toBe("55");expect(exception.max).toBe("100");
   await change(exception,"42.5");expect(onFees).toHaveBeenLastCalledWith({p:{mode:"SHARE",value:"42.5",revision:1}});
  } finally {await act(async()=>flexRoot.unmount());}
 } finally {host.remove();}
});
