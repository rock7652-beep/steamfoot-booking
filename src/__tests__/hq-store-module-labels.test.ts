import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {writeFileSync,mkdirSync} from "node:fs";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),list:vi.fn(),summary:vi.fn(),module:vi.fn(),plan:vi.fn()}));
vi.mock("@/lib/session",()=>({getCurrentUser:async()=>({id:"hq",role:"ADMIN"})}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/actions/store-onboarding",()=>({listStoresAction:m.list,getStoreDeliverySummary:m.summary,updateStoreOperatingStatusAction:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/lib/store-plan",()=>({getStoreForPlanByStoreId:m.plan}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:"a"}));
vi.mock("@/components/store-archive-button",()=>({StoreArchiveButton:()=>React.createElement("span",null,"封存") }));
vi.mock("@/app/hq/dashboard/stores/[storeId]/activate-trial-button",()=>({ActivateTrialButton:()=>null}));
vi.mock("@/app/hq/dashboard/stores/[storeId]/rename-store-form",()=>({RenameStoreForm:()=>React.createElement("span",null,"店名編輯器（模擬）")}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw Error(`redirect:${path}`);}}));
import StoresPage from "@/app/hq/dashboard/stores/page";
import StoreDetailPage from "@/app/hq/dashboard/stores/[storeId]/page";
const cases=[
 {industryModule:"BEAUTY",businessProfile:null,label:"美業店家"},
 {industryModule:"STEAMFOOT",businessProfile:null,label:"蒸足門市"},
 {industryModule:"COURSE",businessProfile:"FITNESS",label:"運動教室"},
 {industryModule:"COURSE",businessProfile:"MUSIC",label:"音樂教室"},
 {industryModule:"SPA",businessProfile:null,label:"SPA／美容美體"},
] as const;
function store(c:typeof cases[number]){return {...c,id:c.industryModule+":"+c.businessProfile,name:"合成驗收門市",slug:"synthetic-store",plan:"GROWTH",planStatus:"TRIAL",operatingStatus:"ACTIVE",isDemo:false,archivedAt:null,currentSubscriptionId:null,staffCount:0,customerCount:0};}
function summary(c:typeof cases[number]){return {store:store(c),accounts:{owner:{name:"驗收店主",email:"owner@example.invalid"},staff:[]},thirdParty:{line:"not_configured"},checklist:[],canActivate:false,urls:{storefront:"/synthetic/member",booking:"/synthetic/booking",register:"/synthetic/register",adminLogin:"/synthetic/login",adminDashboard:"/synthetic/dashboard",hqStoreDetail:"/synthetic/detail"}};}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("React",React);m.permission.mockResolvedValue(true);m.module.mockResolvedValue("course");m.plan.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllGlobals());
function preview(name:string,html:string){if(process.env.HQ_LABEL_PREVIEW_DIR){mkdirSync(process.env.HQ_LABEL_PREVIEW_DIR,{recursive:true});writeFileSync(`${process.env.HQ_LABEL_PREVIEW_DIR}/${name}.html`,html);}}
it("labels all modules accurately in the real HQ store list",async()=>{
 m.list.mockResolvedValue({success:true,data:cases.map(store)});
 const html=renderToStaticMarkup(await StoresPage({searchParams:Promise.resolve({})}));
 for(const c of cases)expect(html).toContain(c.label);
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>m[1]);
 expect(rows[1]).toContain("美業店家");expect(rows[1]).not.toContain("蒸足");
 expect(rows.at(-1)).toContain("模組已停用");expect(rows.at(-1)).not.toContain(">營運中<");expect(rows.at(-1)).not.toMatch(/href="[^\"]*\/features"/);
 preview("list",html);
});
it.each(cases)("preserves $label in the actual detail page",async c=>{
 m.summary.mockResolvedValue({success:true,data:summary(c)});
 const html=renderToStaticMarkup(await StoreDetailPage({params:Promise.resolve({storeId:"synthetic"})}));
 expect(html).toContain(c.label);
 if(c.industryModule!=="STEAMFOOT")expect(html).not.toContain("蒸足");
 if(c.industryModule==="SPA"){expect(html).toContain("SPA 模組已停用");expect(html).not.toContain(">營運中<");expect(html).not.toContain("/synthetic/booking");}
 if(c.industryModule==="BEAUTY"){expect(m.module).not.toHaveBeenCalled();expect(m.plan).not.toHaveBeenCalled();preview("beauty-detail",html);}
});
it.each(["list","detail"])("checks HQ authorization before loading the %s",async kind=>{
 m.permission.mockResolvedValue(false);
 const page=kind==="list"?StoresPage({searchParams:Promise.resolve({})}):StoreDetailPage({params:Promise.resolve({storeId:"synthetic"})});
 await expect(page).rejects.toThrow("redirect:/hq/login");expect(m.list).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
