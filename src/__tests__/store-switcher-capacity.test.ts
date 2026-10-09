// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
const m=vi.hoisted(()=>({switch:vi.fn(),refresh:vi.fn(),error:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/server/actions/store-switch",()=>({switchActiveStore:m.switch}));
vi.mock("sonner",()=>({toast:{error:m.error}}));
import {useCourseDraftGuard} from "@/components/admin/use-course-draft-guard";
import StoreSwitcher from "@/components/store-switcher";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();m.switch.mockResolvedValue({success:false,error:"測試拒絕"});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const stores=(n:number)=>Array.from({length:n},(_,i)=>({id:`store-${i+1}`,name:`測試店 ${String(i+1).padStart(2,"0")}`,isDefault:i===0}));
async function open(n:number,inline=true){await act(async()=>root.render(createElement(StoreSwitcher,{stores:stores(n),activeStoreId:`store-${n}`,inline})));await act(async()=>host.querySelector("button")!.click());return document.querySelector<HTMLElement>('[aria-label="分店清單"]')!;}
it.each([10,20,50])("keeps all %i stores accessible in a portal, separate from the search and footer",async n=>{
 const menu=await open(n);
 expect(menu.parentElement).toBe(document.body);expect(host.contains(menu)).toBe(false);
 expect(menu.textContent).toContain(`共 ${n} 間店舖`);
 expect(menu.querySelectorAll("button")).toHaveLength(n+1);
 const search=menu.querySelector("input")!;expect(document.activeElement).toBe(search);
 const selected=menu.querySelector('button[aria-current="page"]')!;expect(selected.textContent).toContain(String(n).padStart(2,"0"));
 expect(menu.querySelector("input")?.parentElement).not.toBe(selected.parentElement);
 await act(async()=>selected.dispatchEvent(new MouseEvent("click",{bubbles:true})));
 expect(m.switch).toHaveBeenCalledWith(`store-${n}`);expect(m.refresh).toHaveBeenCalledOnce();expect(m.error).toHaveBeenCalledWith("測試拒絕");
});
it("permits list scrolling and stops scroll chaining at either boundary",async()=>{
 const menu=await open(50);const list=menu.querySelector('button')!.parentElement!;
 Object.defineProperties(list,{clientHeight:{configurable:true,value:200},scrollHeight:{configurable:true,value:2000}});
 const wheel=(deltaY:number)=>{const event=new WheelEvent("wheel",{deltaY,bubbles:true,cancelable:true});list.querySelector("button")!.dispatchEvent(event);return event.defaultPrevented;};
 expect(wheel(100)).toBe(false);expect(wheel(-100)).toBe(true);
 list.scrollTop=1800;expect(wheel(100)).toBe(true);expect(wheel(-100)).toBe(false);
});
it("Escape closes the portal and returns keyboard focus to the trigger in sidebar mode",async()=>{
 await open(20,false);const button=host.querySelector("button")!;
 await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
 expect(document.querySelector('[aria-label="分店清單"]')).toBeNull();expect(document.activeElement).toBe(button);
});
it("keeps archived stores out of switching choices and count",async()=>{
 await act(async()=>root.render(createElement(StoreSwitcher,{stores:[...stores(10),{id:"archived",name:"封存測試",isDefault:false,isArchived:true}],activeStoreId:"store-1",inline:true})));
 await act(async()=>host.querySelector("button")!.click());const menu=document.querySelector('[aria-label="分店清單"]')!;
 expect(menu.textContent).toContain("共 10 間店舖");expect(menu.textContent).not.toContain("封存測試");
});

it("filters fifty stores by name and gives an explicit empty result",async()=>{
 const menu=await open(50);const input=menu.querySelector("input")!;
 const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!;
 async function search(value:string){await act(async()=>{set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
 await search("50");expect(menu.querySelectorAll("button")).toHaveLength(2);expect(menu.textContent).toContain("符合 1 間／共 50 間");
 await search("查無此店");expect(menu.textContent).toContain("找不到符合的店舖");expect(menu.querySelectorAll("button")).toHaveLength(1);
});

it("canceling an unsaved store change never changes the store cookie",async()=>{
 function Fixture(){useCourseDraftGuard(true);return createElement(StoreSwitcher,{stores:stores(2),activeStoreId:"store-1",inline:true});}
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
 try {
  await act(async()=>root.render(createElement(Fixture)));
  await act(async()=>host.querySelector("button")!.click());
  const menu=document.querySelector('[aria-label="分店清單"]')!;
  const target=[...menu.querySelectorAll("button")].find(button=>button.textContent?.includes("測試店 02"))!;
  await act(async()=>target.click());
  expect(m.switch).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="分店清單"]')).not.toBeNull();
  confirm.mockReturnValue(true);await act(async()=>target.click());
  expect(m.switch).toHaveBeenCalledWith("store-2");
 } finally {confirm.mockRestore();}
});
