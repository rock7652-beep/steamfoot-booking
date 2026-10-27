// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const actions=vi.hoisted(()=>({central:vi.fn<(data:FormData)=>Promise<void>>(async()=>undefined),liff:vi.fn<(data:FormData)=>Promise<void>>(async()=>undefined)}));
vi.mock("@/server/actions/central-member-store",()=>({selectCentralMemberStoreAction:actions.central}));
vi.mock("@/server/actions/liff-member-stores",()=>({selectLiffMemberStoreAction:actions.liff}));
import { CentralMemberStoreSwitcher } from "@/app/(customer)/central-member-store-switcher";
import { LiffStoreSwitcher } from "@/app/(liff)/liff/liff-store-switcher";
let root:Root,host:HTMLDivElement;
const stores=Array.from({length:20},(_,i)=>({storeId:`store-${i}`,storeSlug:`store-${i}`,storeName:i===1?"名稱很長的已加入會員門市（完整店名顯示）":`門市 ${i}`}));
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
async function render(){await act(async()=>root.render(createElement("div",null,
  createElement("div",{"data-entry":"course",className:"course-portal"},createElement(CentralMemberStoreSwitcher,{currentStoreName:"門市 0",currentStoreSlug:"store-0",stores,compact:true,returnToLiff:true})),
  createElement("div",{"data-entry":"native"},createElement(LiffStoreSwitcher,{currentStoreName:"門市 0",currentStoreSlug:"store-0",stores})))));
  await act(async()=>{for(const button of host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'))button.click()});}
describe("shared member store presentation",()=>{
 it("uses the same trigger, menu and current-row presentation in course and native entries",async()=>{
  await render();const [course,native]=host.children[0].children;
  for(const selector of ['button[aria-haspopup="menu"]','[role="menu"]','[aria-current="location"]'])expect(course.querySelector(selector)?.className).toBe(native.querySelector(selector)?.className);
  for(const entry of [course,native]){
   expect(entry.querySelector('[role="menu"]')?.textContent).toContain("切換會員門市");
   expect(entry.querySelectorAll('[role="menuitem"]')).toHaveLength(20);
   expect(entry.querySelector<HTMLButtonElement>('[aria-current="location"]')?.disabled).toBe(true);
   expect(entry.textContent).toContain(stores[1].storeName);
  }
 });
 it("retains distinct server actions and only forwards the LINE mode for the course adapter",async()=>{
  await render();for(const entry of host.children[0].children)await act(async()=>entry.querySelectorAll('form')[1].dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(actions.central).toHaveBeenCalledTimes(1);expect(actions.liff).toHaveBeenCalledTimes(1);
  expect(actions.central.mock.calls[0][0].get('storeSlug')).toBe('store-1');expect(actions.central.mock.calls[0][0].get('memberEntry')).toBe('liff');
  expect(actions.liff.mock.calls[0][0].get('storeSlug')).toBe('store-1');expect(actions.liff.mock.calls[0][0].get('memberEntry')).toBeNull();
 });
 it("dismisses from outside and returns focus to the trigger on Escape",async()=>{
  await render();await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('menu');
  await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click());
  await act(async()=>document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
  expect(host.querySelector('[role="menu"]')).toBeNull();
 });
});
