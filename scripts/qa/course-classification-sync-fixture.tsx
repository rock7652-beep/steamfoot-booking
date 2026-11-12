// Actual workspace with synthetic, in-memory receipts only. No backend access.
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseMemberWorkspace} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import {OperationScope} from '@/components/operations/operation-scope';
import {coursePlanValues} from '@/lib/course-plan-save';
const subjects=[{id:'A',name:'吉他團體班',category:'',isActive:true},{id:'B',name:'吉他個別課',category:'',isActive:true},{id:'C',name:'吉他自組班',category:'',isActive:true}];
const makeTemplate=(id:string,subjectId:string)=>({id,name:'合成收費版本',category:'',isActive:true,durationMinutes:100,musicSubjectId:subjectId,classType:'PRIVATE',musicTeacherShare:0.6,musicPricePerLesson:650,musicTermLessons:4,musicValidityDaysPerTerm:35,musicTrialMode:null,musicScheduleMode:'FIXED'});
const original={...coursePlanValues.parse({id:'one-to-two',name:'吉他一對二$650',points:4,price:2600,unit:'SESSION',musicTerms:1,templateIds:['old-A'],validDays:35,chargeSettings:{kind:'plan',durationMinutes:100,trialPrice:null,trialDuration:null,providerIds:[],providerScope:'QUALIFIED'}}),id:'one-to-two',lowBalanceEnabled:false,lowBalanceThreshold:null};
const qa=window as unknown as {qaAction:(...args:unknown[])=>Promise<unknown>;qaSave:(input:Record<string,unknown>)=>unknown;qaUpdate:(id:string,price?:number)=>void;qaCalls:Record<string,unknown>[];qaRefreshes:number};
qa.qaCalls=[];qa.qaRefreshes=0;qa.qaAction=async()=>{throw Error('Backend operations forbidden in synthetic QA')};
let serial=0;
const committed=new Map([[original.id,original]]);
qa.qaSave=input=>{
 qa.qaCalls.push(input);
 const subject=(input.musicSetup as {subjectId:string}).subjectId;
 const template=makeTemplate('new-'+(++serial),subject);
 const row={...coursePlanValues.parse(input),id:String(input.id??'created-'+serial),templateIds:[template.id],lowBalanceEnabled:false,lowBalanceThreshold:null,catalogTemplates:[template]};
 committed.set(row.id,row);
 return {success:true,storeId:'synthetic',data:row};
};
function Fixture(){
 const [plans,setPlans]=useState([original]),[templates,setTemplates]=useState([makeTemplate('old-A','A')]);
 useEffect(()=>{const previous=qa.qaUpdate;qa.qaUpdate=(id,price)=>{const rows=[...committed.values()];setTemplates(rows.flatMap(row=>'catalogTemplates' in row?row.catalogTemplates as ReturnType<typeof makeTemplate>[]:[makeTemplate('old-A','A')]));setPlans(rows.map(row=>({...row,...(row.id===id&&price!==undefined?{price}:{}),catalogTemplates:undefined})));};return()=>{qa.qaUpdate=previous;};},[]);
 return <OperationScope scope="classification-sync-synthetic"><main className="mx-auto max-w-[1440px] space-y-3 p-4"><h1 className="text-xl">收費方式 · 合成驗收資料</h1><p>實際表單與清單；網路與後端寫入封鎖。</p><CourseMemberWorkspace view="plans" music previewStoreId="synthetic" subjects={subjects} templates={templates} plans={plans} people={[]} cards={[]} customerRows={[]} assignmentStaff={[]} canEdit canCreate canReadCards canManageStaff={false} canAssign={false} canReadBookings={false} canReadTransactions={false} healthEnabled={false} canAssignManager={false}/></main></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
