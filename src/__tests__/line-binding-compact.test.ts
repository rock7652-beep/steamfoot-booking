import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/reminder",()=>({generateLineBindingCode:vi.fn(),unlinkLineAccount:vi.fn()}));
vi.mock("@/server/actions/line-rebind",()=>({createLineRebindCaptureRequest:vi.fn(),cancelLineRebindCaptureRequest:vi.fn(),dryRunLineRebind:vi.fn(),executeLineRebindAction:vi.fn()}));
import {LineBindingSection} from "@/app/(dashboard)/dashboard/customers/[id]/line-binding-section";
it("compact manager view exposes status and help without identifiers, capture internals or unlink",()=>{
 const html=renderToStaticMarkup(createElement(LineBindingSection,{compact:true,customerId:"test",lineLinkStatus:"LINKED",lineUserId:"Uprivate-identifier",lineLinkedAt:null,lineBindingCode:null,lineBindingCodeCreatedAt:null,canManageLineRebind:true,canRunLineRebindDryRun:false,activeLineRebindRequest:null}));
 expect(html).toContain("已綁定");expect(html).toContain("重新綁定");
 for(const text of ["Uprivate-identifier","LINE User ID","候選密文","解除綁定","hash"]){expect(html).not.toContain(text);}
});
it("unlinked compact view does not expose a generated code until help is requested",()=>{
 const html=renderToStaticMarkup(createElement(LineBindingSection,{compact:true,customerId:"test",lineLinkStatus:"UNLINKED",lineUserId:null,lineLinkedAt:null,lineBindingCode:"private-code",lineBindingCodeCreatedAt:null,canManageLineRebind:false,canRunLineRebindDryRun:false,activeLineRebindRequest:null}));
 expect(html).toContain("未綁定");expect(html).toContain("協助綁定");expect(html).not.toContain("private-code");
});
