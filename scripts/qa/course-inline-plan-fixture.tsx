// Actual controls with synthetic transport. No real account, writes or notifications.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanGridActions,type PlanGridAction} from '@/components/admin/plan-grid-actions';
import {CourseInlinePlanManagement} from '@/app/(dashboard)/dashboard/courses/inline-plan-management';
import {LessonProgressGrid} from '@/components/admin/lesson-progress-grid';
const card={id:'synthetic-card',name:'鋼琴二十堂',unit:'SESSION',remaining:19,held:0,available:19,expiresAt:'2027-02-08T15:59:59.999Z',closed:false,members:[{id:'synthetic-learner',name:'測試學員'}],sessionAdjustments:[]};
Object.assign(window,{__writes:0,__inlinePreview:async(name:string)=>{
 await new Promise(resolve=>setTimeout(resolve,120));
 if(name==='browseCourseCards')return {success:true,rows:[card],hasMore:false};
 throw Error('Writes forbidden in synthetic preview');
}});
function Fixture(){
 const[action,setAction]=useState<PlanGridAction|null>(null);
 return <main className="mx-auto max-w-4xl p-3"><p className="mb-3 text-sm">合成資料預覽 · 不連線、不寫入</p><aside aria-label="顧客資料" className="max-h-[85dvh] overflow-auto rounded-xl border bg-white p-4"><h2 className="text-base font-semibold">測試學員</h2><div className="h-28"/><section className="rounded-xl border bg-earth-50 p-3"><h3 className="mb-3 text-base font-semibold">鋼琴二十堂　可用 19 堂</h3><LessonProgressGrid total={20} completed={[{id:'lesson',date:'2026-11-10T02:00:00Z'}]} columns={window.innerWidth<640?5:10} showSummary={false}/>{action?<CourseInlinePlanManagement storeId="synthetic-store" customerId="synthetic-learner" cardId={card.id} action={action} dataScope="legacy" revision={0} music onPending={()=>{}} onDirtyChange={()=>{}} onSaved={()=>{throw Error('Writes forbidden')}} onCancel={()=>setAction(null)}/>:<PlanGridActions label={card.name} onSelect={setAction}/>}</section><div className="h-80"/></aside></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
