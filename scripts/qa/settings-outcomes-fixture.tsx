// Isolated component preview: all requests are intercepted by the browser harness.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Toaster } from "sonner";
import { CourseSelfBookingSettings } from "../../src/app/(dashboard)/dashboard/courses/course-self-booking-settings";
import { BookableUntilForm } from "../../src/app/(dashboard)/dashboard/settings/hours/bookable-until-form";
import { PlanFormDrawer } from "../../src/app/(dashboard)/dashboard/plans/_components/plan-form-drawer";
import { MusicSubjectCatalog } from "../../src/app/(dashboard)/dashboard/courses/music-subject-catalog";
import { CoursePlanDraftForm, type Plan } from "../../src/app/(dashboard)/dashboard/courses/course-profile-forms";
import { StaffAccountEditor, emptyStaffAccountPolicy } from "../../src/app/(dashboard)/dashboard/staff/staff-account-editor";
import type { StaffWorkspacePerson } from "../../src/app/(dashboard)/dashboard/staff/staff-workspace";
import { FeaturePresentationProvider } from "../../src/components/feature-presentation";

export const person = {id:"qa-staff",updatedAt:"2026-10-21T00:00:00.000Z",userId:"qa-user",role:"STAFF",permissions:[],displayName:"隔離人員",legalName:"",roleLabel:"員工",email:"qa@example.invalid",phone:null,colorCode:"#224466",status:"ACTIVE",customerCount:0,specialties:"",specialtyKeys:[],emergencyContact:null,weeklyAvailability:[],scheduleExceptions:[],canEdit:true,canResetPassword:false,compensationMode:null,compensationValue:null} satisfies StaffWorkspacePerson;
const plan:Plan={id:"qa-plan",name:"隔離方案",points:10,price:1000,validDays:30,isActive:true,unit:"POINT",templateIds:[]};
function Fixture() {
  const kind = new URLSearchParams(location.search).get("kind");
  const [open,setOpen]=useState(true);
  const [pending,setPending]=useState(false);
  const [receipt,setReceipt]=useState("");
  const close=()=>setOpen(false);
  return <FeaturePresentationProvider states={{}}><main className="mx-auto max-w-5xl p-4">
    <p>隔離元件預覽；回覆由測試攔截，非正式耗時。</p>
    <output data-receipt>{receipt}</output>
    {!open&&<p data-closed>已收合</p>}
    {kind==="self"&&<CourseSelfBookingSettings storeId="qa-store" expanded={open} canEdit initialEnabled onEdit={()=>setOpen(true)} onClose={close}/>}
    {kind==="window"&&<BookableUntilForm storeId="qa-store" initialDate={null} initialDays={14} today="2026-10-21" canManage/>}
    {kind==="steam-plan"&&<PlanFormDrawer storeId="qa-store" open={open} mode="new" plan={null} onClose={close} onSaved={row=>setReceipt(row.name)}/>}
    {kind==="subject"&&<MusicSubjectCatalog storeId="qa-store" subjects={[]} canCreate canEdit initialCreate/>}
    {kind==="course-plan"&&open&&<><CoursePlanDraftForm storeId="qa-store" plan={plan} templates={[]} termSessions={[]} profitEnabled={false} onPending={setPending} onSaved={(row,warning)=>{setReceipt(row?.name??"");if(!warning)close();}}/><button type="submit" form="course-member-form" disabled={pending}>儲存</button></>}
    {kind==="staff"&&open&&<StaffAccountEditor storeId="qa-store" person={person} policy={emptyStaffAccountPolicy} onClose={close} onSaved={row=>setReceipt(row.displayName)}/>}
    <Toaster/>
  </main></FeaturePresentationProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
