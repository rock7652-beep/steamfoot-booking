import {useMemo,useState,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseMemberWorkspace} from '@/app/(dashboard)/dashboard/courses/member-workspace';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import '@/app/globals.css';
const params=new URLSearchParams(location.search),profile=params.get('profile')??'sports';
async function read(operation:string,input:unknown){const response=await fetch('/__qa/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return response.json();}
Object.assign(globalThis,{__qaReadCards:(input:unknown)=>read('cards',input),__qaOverview:(id:string)=>read('overview',{customerId:id}),__qaBookings:(id:string,_offset:number,range:unknown)=>read('bookings',{customerId:id,range}),__qaNote:(input:unknown)=>read('note',input)});
const names=['合成顧客甲','合成顧客乙'];
const initialPeople=names.map((name,index)=>({id:'customer-'+(index?'b':'a'),name,phone:'090000000'+index,serviceNote:null as string|null,userId:null,assignedStaff:null,sponsor:null,email:'qa@example.invalid',birthday:'1990-01-01',lineLinkStatus:'LINKED' as const,lineName:'合成 LINE'}));
function Fixture(){
 const [people,setPeople]=useState(initialPeople);
 const source=useMemo(()=>profile==='beauty'?{browseCards:(input:unknown)=>read('cards',input),bookings:(id:string,_offset:number,range:unknown)=>read('bookings',{customerId:id,range}),saveNote:async(input:{customerId:string;serviceNote:string|null})=>{const result=await read('note',input);if(result.success)setPeople(old=>old.map(p=>p.id===input.customerId?{...p,serviceNote:input.serviceNote}:p));return result;},basePath:'/dashboard/beauty?tab=顧客管理',sessionUnitLabel:'次',confirmDiscard:false,support:async()=>({success:false,error:'合成預覽不連接真實會員身分'}),onSchedule:()=>{window.dispatchEvent(new Event('qa:schedule'));}} as never:undefined,[]);
 const props={source,previewStoreId:'synthetic',sportsNative:profile!=='music',music:profile==='music',view:'customers',templates:[],people,plans:[],cards:[],customerRows:people.map(p=>({...p,mergedIntoCustomerId:null,userStatus:null,validPackageSessions:0,sponsoredCount:0})),canEdit:true,canCreate:false,canManageStaff:false,canAssign:true,canSchedule:profile!=='beauty',canReadBookings:true,canReadTransactions:false,healthEnabled:false,canReadCards:true,assignmentStaff:[],canAssignManager:false} as unknown as ComponentProps<typeof CourseMemberWorkspace>;
 return <PanelReadProvider><CustomerLabelsProvider initial={{available:true,enabled:false,canEdit:false,canManage:false,categories:[],labels:[],assignments:{}}}><main className="min-w-0 p-4"><p className="text-sm">隔離預覽 · {profile} · 合成資料</p><CourseMemberWorkspace {...props}/></main></CustomerLabelsProvider></PanelReadProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
