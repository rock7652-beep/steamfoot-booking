// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({replace:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:m.replace}),usePathname:()=>"/s/music/admin/dashboard/revenue"}));
import {InstantFilterForm} from "@/components/instant-filter-form";
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();m.replace.mockClear();host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(InstantFilterForm,null,[React.createElement("input",{key:"s",name:"search"}),React.createElement("select",{key:"st",name:"status"},React.createElement("option",{value:""},"全部"),React.createElement("option",{value:"CONFIRMED"},"已確認")),React.createElement("input",{key:"f",name:"from",type:"date"}),React.createElement("input",{key:"t",name:"to",type:"date"})])));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function change(name:string,value:string){await act(async()=>{const input=host.querySelector(`[name="${name}"]`)!;const proto=input.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(input,value);input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));});}
it("combines rapid search and select changes without submitting",async()=>{await change("search","王");await change("status","CONFIRMED");await act(async()=>vi.runAllTimers());expect(m.replace).toHaveBeenCalledTimes(1);expect(m.replace.mock.calls[0][0]).toContain("status=CONFIRMED");expect(decodeURIComponent(m.replace.mock.calls[0][0])).toContain("search=王");});
it("waits for complete valid dates",async()=>{await change("from","2026-09-29");await act(async()=>vi.runAllTimers());expect(m.replace).not.toHaveBeenCalled();await change("to","2026-09-28");await act(async()=>vi.runAllTimers());expect(m.replace).not.toHaveBeenCalled();expect(host.textContent).toContain("結束日期不能早於");await change("to","2026-09-30");await act(async()=>vi.runAllTimers());expect(m.replace).toHaveBeenCalledTimes(1);});
