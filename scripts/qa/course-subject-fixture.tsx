// Isolated UI fixture; actions below never contact a server or database.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {CoursePlanDraftForm} from '../../src/app/(dashboard)/dashboard/courses/course-profile-forms';
import {CardSubjectReview} from '../../src/app/(dashboard)/dashboard/courses/card-subject-review';
const qa=window as unknown as {qaCalls:unknown[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>;failSave:boolean;responseLost:boolean};
qa.qaCalls=[];
qa.qaAction=async(name,...args)=>{
 if(name==='loadCardSubjectReview')return {success:true,data:{revision:'a'.repeat(64),subjects:[{id:'A',name:'舞蹈（常態課程）'},{id:'B',name:'舞蹈（基礎課程）'}],name:'舞蹈 20 堂',remaining:19,unit:'SESSION',reserved:0,shared:false}};
 if(name==='confirmCardSubjectAction'){qa.qaCalls.push(args[0]);if(qa.responseLost)throw Error('Lost reply');return qa.failSave?{success:false,error:'方案或預約已變更，請重新核對'}:{success:true};}
 throw Error('Unexpected backend call '+name);
};
function Fixture(){const [saved,setSaved]=useState(false);return <OperationScope scope="synthetic"><main className="mx-auto max-w-5xl space-y-4 p-5"><h1>同科目方案設定（合成資料）</h1><CoursePlanDraftForm storeId="synthetic" plan={null} subjects={[{id:'A',name:'舞蹈（常態課程）',category:'',isActive:true}]} templates={[{id:'template',name:'舞蹈',category:'',isActive:true,musicSubjectId:'A'}]} termSessions={[]} sportsData={{storeId:'synthetic',schedulingModes:{selfBookingEnabled:true,assignedSchedulingEnabled:false},date:'2026-11-10',subjects:[{id:'A',name:'舞蹈',category:'',active:true,updatedAt:'v1',templateId:'template'}],coaches:[{id:'teacher',name:'合成老師',templates:['template']}],fees:[],lessons:[],students:[],customers:[],rooms:[]}} profitEnabled={false} onPending={()=>{}} onSaved={()=>{}}/>{saved?<p role="status">科目確認完成，剩餘 19 堂</p>:<CardSubjectReview cardId="card" customerId="student" storeId="synthetic" onSaved={()=>setSaved(true)}/>}</main></OperationScope>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
