import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanGridActions,type PlanGridAction} from '@/components/admin/plan-grid-actions';
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import {LessonProgressGrid} from '@/components/admin/lesson-progress-grid';
import type {SessionAdjustmentInput,SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
function Fixture(){
 const [action,setAction]=useState<PlanGridAction|null>(null),[remaining,setRemaining]=useState(8),[records,setRecords]=useState<SessionAdjustmentRecord[]>([]);
 const save=async(d:SessionAdjustmentInput)=>{const next=d.expectedRemaining-d.quantity;const record:SessionAdjustmentRecord={id:d.requestKey,cardId:d.cardId,customerId:d.customerId,customerName:'合成學員',operation:d.operation,quantity:d.quantity,occurredOn:d.occurredOn??null,reason:d.reason,recordedAt:'2026-11-11T02:00:00Z',actorName:'合成店長',reversalOf:null,remainingBefore:d.expectedRemaining,remainingAfter:next};setRecords(r=>[...r,record]);setRemaining(next);return {success:true as const,data:{record,remaining:next,expiresAt:'2027-12-31T15:59:59.999Z'}};};
 const completed=[{id:'one',date:'2026-10-20T02:00:00Z',customerName:'合成學員'},{id:'two',date:'2026-10-27T02:00:00Z',customerName:'合成學員'}];
 return <main className="mx-auto min-h-screen max-w-[1100px] bg-white p-4 text-earth-800"><p className="mb-3 text-sm text-earth-500">本機合成預覽 · 不連線、不更動正式資料</p>{action&&<button className="mb-3 min-h-11 rounded border px-3" onClick={()=>setAction(null)}>返回方案</button>}<section className="rounded-lg border border-earth-200 bg-earth-50 p-3"><div className="mb-1 flex items-center justify-between gap-3 text-sm"><h1 className="font-semibold">鋼琴 10 堂方案</h1><span>已上 2／10 堂</span></div><LessonProgressGrid compact showSummary={false} total={10} completed={completed}/><div className="mt-1 flex flex-wrap items-center justify-between gap-x-3"><p className="text-sm">剩餘 {remaining} 堂</p>{action?<PlanManagementControls key={action} compactActions initialAction={action} storeId="synthetic" card={{id:'synthetic-card',remaining,held:0,expiresAt:'2027-12-31T15:59:59.999Z',closed:false}} save={async()=>({success:false,error:'本預覽不執行整份註銷'})} sessionAdjustment={{save,records,members:[{id:'synthetic-student',name:'合成學員'}]}} onSaved={()=>{}}/>:<PlanGridActions label="鋼琴 10 堂方案" onSelect={setAction}/>}</div></section></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
