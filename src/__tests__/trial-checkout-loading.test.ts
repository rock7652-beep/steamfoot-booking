import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {TrialCheckoutLoading} from "@/app/(dashboard)/dashboard/bookings/trial-checkout-loading";
it("shows stable trial details while authoritative payment data is pending, without guessing payment state",()=>{
 const html=renderToStaticMarkup(createElement(TrialCheckoutLoading,{bookingDate:"2026-10-15",slotTime:"10:00",people:2,staffName:"測試人員",error:null,onClose:()=>{}}));
 expect(html).toContain("預約詳情");expect(html).toContain("到店人員");expect(html).toContain("10:00");expect(html).toContain('aria-busy="true"');
 expect(html).not.toContain("未收款");expect(html).not.toContain("完成服務");expect(html).not.toContain("NT$");expect(html.match(/<button/g)).toHaveLength(1);
});
it("keeps a failed load visible in the same shell and leaves a close control",()=>{
 const html=renderToStaticMarkup(createElement(TrialCheckoutLoading,{error:"讀取失敗，請稍後重試",onClose:()=>{}}));
 expect(html).toContain('role="alert"');expect(html).toContain('aria-busy="false"');expect(html).toContain('aria-label="關閉"');
});
