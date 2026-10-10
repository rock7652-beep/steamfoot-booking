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

it("selects courses before showing fees, preserves per-course exceptions, and previews the configured price",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onSettings=vi.fn(),onFees=vi.fn();
 const props={templates:[{id:"p",name:"吉他",musicPricePerLesson:800,musicTeacherShare:0.6}],qualificationIds:[] as string[],fees:{p:{mode:"SHARE" as const,value:"40",revision:2}},settings:{defaultRatio:0.6,subjectRules:{},revision:1},onSettings,onFees,onQualification:vi.fn()};
 try {
  await act(async()=>root.render(createElement(MusicTeacherFeeEditor,props)));expect(host.textContent).not.toContain("老師分潤");expect(host.querySelector('[aria-label="搜尋課程"]')).not.toBeNull();
  await act(async()=>root.render(createElement(MusicTeacherFeeEditor,{...props,qualificationIds:["p"]})));
  const done=Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="完成選擇")!;await act(async()=>done.click());
  expect(host.textContent).toContain("老師 40% · 定價試算 $320／堂");
  const ratio=host.querySelector('[aria-label="老師全科預設比例"]') as HTMLInputElement;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(ratio,"50");ratio.dispatchEvent(new Event("input",{bubbles:true}));});
  expect(onSettings).toHaveBeenLastCalledWith(expect.objectContaining({defaultRatio:0.5}));expect(onFees).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});
