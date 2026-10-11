// Local, synthetic component fixture. Never imported by a Next route.
import {createRoot} from "react-dom/client";
import {CourseStaffAvailabilityEditor} from "../../src/app/(dashboard)/dashboard/courses/course-staff-availability-editor";
import {StaffWorkspace,type StaffWorkspacePerson} from "../../src/app/(dashboard)/dashboard/staff/staff-workspace";
import "../../src/app/globals.css";

const person:StaffWorkspacePerson={id:"synthetic",updatedAt:"2026-10-10T00:00:00.000Z",userId:"synthetic-user",role:"STAFF",permissions:[],displayName:"測試人員・長名稱與聯絡資訊排列",legalName:"虛構測試人員",roleLabel:"門市人員",email:"qa@example.test",phone:"0900000000",colorCode:"#123456",status:"ACTIVE",customerCount:0,specialties:"尚未設定專業項目",specialtyKeys:[],emergencyContact:null,weeklyAvailability:[],scheduleExceptions:[],canEdit:true,canResetPassword:true,compensationMode:null,compensationValue:null};
const state={revision:"a".repeat(64),inheritStoreHours:false,weekly:[],exceptions:[]};
Object.assign(globalThis,{__qaAvailability:state});
globalThis.fetch=async()=>{throw Error("This visual fixture prohibits network mutations");};
const staff=new URLSearchParams(location.search).get("view")==="staff";
createRoot(document.getElementById("root")!).render(
 <main className="mx-auto min-w-0 max-w-6xl p-4">
  <p className="mb-3 text-sm text-earth-600">#1283 虛構元件畫面測試・未登入・未連資料庫</p>
  {staff?<StaffWorkspace storeId="synthetic-store" accountListOnly people={Array.from({length:25},(_,i)=>({...person,id:`synthetic-${i}`,userId:`synthetic-user-${i}`,displayName:`${person.displayName} ${i+1}`}))} today="2026-10-10" canManage showSpaCompensation={false} createAction={async()=>{throw Error("虛構畫面禁止儲存")}}/>:<CourseStaffAvailabilityEditor storeId="synthetic-store" staffId="synthetic" fitness/>}
 </main>
);
