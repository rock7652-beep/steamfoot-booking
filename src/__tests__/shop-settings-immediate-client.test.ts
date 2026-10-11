// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/hq/dashboard/settings/payment",useRouter:()=>({refresh:m.refresh})}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {PaymentSettingsForm} from "@/app/(dashboard)/dashboard/settings/payment/payment-form";
import {TrialSettingsForm} from "@/app/(dashboard)/dashboard/settings/trial/trial-form";
import {paymentSettingsRevision,trialSettingsRevision} from "@/lib/shop-settings-save";
const payment={bankName:null,bankCode:null,bankAccountNumber:null,lineOfficialId:null,lineOfficialUrl:null};
const trial={trialEnabled:true,trialDefaultPrice:499,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:3000};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",m.fetch);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it.each(["payment","trial"] as const)("%s keeps the same retry and confirms immediately without refresh",async kind=>{
 await act(async()=>root.render(kind==="payment"?createElement(PaymentSettingsForm,{storeId:"store",initial:payment}):createElement(TrialSettingsForm,{storeId:"store",initial:trial})));
 const input=kind==="payment"?host.querySelector<HTMLInputElement>('input[aria-label="銀行名稱"]')!:host.querySelector<HTMLInputElement>('input[type="number"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,kind==="payment"?"新銀行":"800");input.dispatchEvent(new Event("input",{bubbles:true}));});
 m.fetch.mockRejectedValueOnce(new Error("lost reply"));
 await act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(m.fetch).toHaveBeenCalledTimes(1);expect(host.textContent).toContain("尚未確認儲存結果");expect(input.disabled||!!input.closest("fieldset[disabled]")).toBe(true);
 const values=kind==="payment"?{...payment,bankName:"新銀行"}:{...trial,trialDefaultPrice:800};const revision=kind==="payment"?paymentSettingsRevision(values):trialSettingsRevision(values);
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"store",data:{values,revision}})});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.fetch.mock.calls[0][1].body).toBe(m.fetch.mock.calls[1][1].body);expect(m.fetch.mock.calls[1][0]).toBe("/hq/dashboard/settings-save/shop");expect(m.refresh).not.toHaveBeenCalled();
 expect(host.textContent).not.toContain("尚未確認儲存結果");expect(input.value).toBe(kind==="payment"?"新銀行":"800");
});
