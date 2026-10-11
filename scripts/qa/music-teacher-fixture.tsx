import {createRoot} from "react-dom/client";
import {CourseStaffWorkspace} from "../../src/app/(dashboard)/dashboard/courses/staff-workspace";
import "../../src/app/globals.css";
Object.assign(globalThis,{__qaAvailability:{revision:"a".repeat(64),inheritStoreHours:true,weekly:[],exceptions:[],retainedSessions:[]}});
const staff={updatedAt:"2026-10-10T00:00:00.000Z",id:"synthetic",name:"測試教師・長名稱",kind:"coach" as const,coachEnabled:true,qualificationIds:["g"],qualificationsConfirmed:true,coachLoginReady:false,birthday:"",emergencyContactRelation:"家人",assignments:[],email:"",phone:"0900000000",emergencyContactName:"測試聯絡人",emergencyContactPhone:"0900000001",active:true,memberEnabled:true,permissions:[],customerId:""};
createRoot(document.getElementById("root")!).render(<main className="p-4"><p>虛構教師元件驗收</p><CourseStaffWorkspace previewStoreId="synthetic" staff={[staff]} maxStaff={10} templates={Array.from({length:30},(_,i)=>({id:i?`g${i}`:"g",name:`吉他個別課程 ${i+1}`,subjectName:"吉他"}))} customers={[]} canManage music feeEnabled canEditFees permissionGroups={[]}/></main>);
