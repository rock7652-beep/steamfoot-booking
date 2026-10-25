// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({pay:vi.fn(),correct:vi.fn(),publish:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-fee-payment",()=>({payCourseFee:mocks.pay,correctCourseFee:mocks.correct}));
vi.mock("@/lib/music-finance-sync",()=>({publishMusicFinanceChange:mocks.publish}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
import {CourseFeePaymentButton,CourseFeeCorrectionButton} from "@/app/(dashboard)/dashboard/revenue/_components/course-fee-payment-button";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());});
it("publishes only confirmed payment saves and retains an uncertain draft for retry",async()=>{
 mocks.pay.mockResolvedValueOnce({success:false,error:"待確認"}).mockResolvedValueOnce({success:true});
 await act(async()=>root.render(React.createElement(CourseFeePaymentButton,{sessionId:"fixture",amount:480})));
 await act(async()=>host.querySelector("button")!.click());
 const form=host.querySelector("form")!;
 await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(mocks.publish).not.toHaveBeenCalled();expect(host.querySelector("form")).toBe(form);
 const firstKey=mocks.pay.mock.calls[0][0].requestKey;
 await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(mocks.pay.mock.calls[1][0].requestKey).toBe(firstKey);
 expect(mocks.publish).toHaveBeenCalledOnce();expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("publishes payment corrections only after the server confirms success",async()=>{
 mocks.correct.mockResolvedValueOnce({success:false,error:"衝突"}).mockResolvedValueOnce({success:true});
 await act(async()=>root.render(React.createElement(CourseFeeCorrectionButton,{paymentId:"fixture"})));
 await act(async()=>host.querySelector("button")!.click());
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(mocks.publish).not.toHaveBeenCalled();
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(mocks.publish).toHaveBeenCalledOnce();expect(mocks.refresh).toHaveBeenCalledOnce();
});
