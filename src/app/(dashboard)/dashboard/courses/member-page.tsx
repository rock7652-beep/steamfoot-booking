import { CustomerLabelsSeed } from "@/components/customer-labels";
import { PageShell, PageHeader } from "@/components/desktop";
import { loadCourseMemberWorkspace } from "@/server/queries/course-member-workspace";
import { CoursePurchaseReview } from "./purchase-review";
import { CourseMemberWorkspaceEntry } from "./member-workspace-entry";
import { CoursePurchaseIntentProvider } from "./purchase-recovery";
export async function CourseMemberPage({view,query={}}:{view:"customers"|"plans";query?:Record<string,string|undefined>}){
 const data=await loadCourseMemberWorkspace(view,query);
 const {workspaceProps:props}=data;
 return <CustomerLabelsSeed initial={data.labelSnapshot}>
  <PageShell className={`course-workspace mx-auto flex max-w-[1440px] flex-col px-6 ${view==="plans"?"gap-1 py-1":"gap-2 py-2"}`}>
   {view==="plans"&&<><PageHeader title={props.sportsNative?"收費方式":props.music?"收費方式":"方案管理"}/><CoursePurchaseReview {...data.review}/></>}
   <CoursePurchaseIntentProvider enabled={data.recoveryEnabled} storeId={data.storeId}>
    <CourseMemberWorkspaceEntry key={data.storeId} {...props}/>
   </CoursePurchaseIntentProvider>
  </PageShell>
 </CustomerLabelsSeed>;
}
