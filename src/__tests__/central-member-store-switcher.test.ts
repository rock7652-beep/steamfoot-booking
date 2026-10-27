// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const action = vi.hoisted(() => vi.fn<(data: FormData) => Promise<void>>(async () => undefined));
vi.mock("@/server/actions/central-member-store", () => ({ selectCentralMemberStoreAction: action }));
import { CentralMemberStoreSwitcher } from "@/app/(customer)/central-member-store-switcher";

const stores=[{storeId:"a",storeSlug:"a",storeName:"課程門市"},{storeId:"b",storeSlug:"b",storeName:"已加入的蒸足門市"}];
let root: Root, host: HTMLDivElement;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.clearAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(extra: Partial<Parameters<typeof CentralMemberStoreSwitcher>[0]>={}) {
  await act(async()=>root.render(createElement(CentralMemberStoreSwitcher,{currentStoreName:"課程門市",currentStoreSlug:"a",stores,compact:true,...extra})));
}
it("does not offer switching without another verified membership",async()=>{
  await render({stores:stores.slice(0,1)});expect(host.querySelector("button")).toBeNull();
});
it("preserves the active operation when the existing leave guard refuses switching",async()=>{
  const guard=vi.fn(()=>false);await render({onBeforeSwitch:guard});
  await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());
  const event=new Event("submit",{bubbles:true,cancelable:true});
  await act(async()=>host.querySelectorAll("form")[1].dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);expect(guard).toHaveBeenCalledTimes(1);expect(action).not.toHaveBeenCalled();
});
it("refuses submission if saving starts after the menu was opened",async()=>{
  await render();await act(async()=>host.querySelector<HTMLButtonElement>("button")!.click());await render({disabled:true});
  expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
  const event=new Event("submit",{bubbles:true,cancelable:true});
  await act(async()=>host.querySelectorAll("form")[1].dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);expect(action).not.toHaveBeenCalled();
});
