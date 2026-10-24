// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {MusicAssignmentPayment} from "@/components/admin/music-assignment-payment";
const joinOptions=vi.hoisted(()=>vi.fn().mockResolvedValue({success:true,options:[]}));
vi.mock("@/server/actions/course-members",()=>({loadMusicJoinOptions:joinOptions}));
vi.mock("@/server/actions/course-checkout-status",()=>({getCourseCheckoutCashStatus:vi.fn()}));
let host:HTMLDivElement,root:Root;
const summary=vi.fn();
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(points=4,price=3200){await act(async()=>root.render(createElement(MusicAssignmentPayment,{plan:{id:"plan",points,price,validDays:35,musicTerms:1,musicTermSizes:[points]},canDiscount:true,onSummary:summary})));}
async function change(selector:string,value:string){const el=host.querySelector(selector) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));});}
it("quotes three ordinary periods without auto gifts or optional join requests",async()=>{await render();await change('input[type="number"]',"3");expect(host.textContent).toContain("3 期 · 共 12 堂");expect(host.textContent).toContain("首次扣堂起 105 天");expect((host.querySelector('[name="expectedListPrice"]') as HTMLInputElement).value).toBe("9600");expect((host.querySelector('[name="musicManualBonus"]') as HTMLInputElement).value).toBe("0");expect(joinOptions).not.toHaveBeenCalled();expect(host.querySelectorAll("details[open]")).toHaveLength(0);});
it("keeps a five-lesson promotion at five lessons when discounted to 3200",async()=>{await render(5,4000);await change("select","RATE");await change('[aria-label="優惠數值"]',"8");expect(host.textContent).toContain("1 期 · 共 5 堂");expect(summary).toHaveBeenLastCalledWith({paid:3200,valid:false});await change('[name="paymentMethod"]',"CARD");expect(summary).toHaveBeenLastCalledWith({paid:3200,valid:true});});
it("blocks invalid period counts",async()=>{await render();await change('input[type="number"]',"0");expect(summary).toHaveBeenLastCalledWith({paid:null,valid:false});});

it("accepts 85 and 77 discounts and preserves decimal notation",async()=>{await render(4,2300);await change('input[type="number"]',"4");await change("select","RATE");await change('[name="paymentMethod"]',"CARD");for(const [input,paid,discount] of [["85",7820,"15"],["8.5",7820,"15"],["77",7084,"23"],["7.7",7084,"23"]] as const){await change('[aria-label="優惠數值"]',input);expect(summary).toHaveBeenLastCalledWith({paid,valid:true});expect((host.querySelector('[name="discountValue"]') as HTMLInputElement).value).toBe(discount);}await change('[aria-label="優惠數值"]',"101");expect(summary).toHaveBeenLastCalledWith({paid:null,valid:false});});
