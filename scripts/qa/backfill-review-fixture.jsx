// Synthetic component preview only; no backend, account or notification access.
import {createRoot} from 'react-dom/client';
import {PlanSessionAdjustment} from '@/components/admin/plan-session-adjustment';
const token='a'.repeat(64);
const original={id:'original',cardId:'synthetic-card',customerId:'learner',customerName:'合成學員',operation:'BACKFILL',quantity:1,occurredOn:'2026-11-03',reason:'',recordedAt:'2026-11-10T02:00:00Z',actorName:'合成店長',reversalOf:null,remainingBefore:10,remainingAfter:9};
Object.assign(window,{__syntheticDebits:0});
async function save(d){
 if(d.duplicateAcknowledgement!==token)return {success:false,error:'當天已有扣堂紀錄',duplicateReview:{token,date:d.occurredOn,existingQuantity:1}};
 window.__syntheticDebits++;
 return {success:true,data:{remaining:8,expiresAt:'2027-12-31T15:59:59.999Z',record:{...original,id:d.requestKey,quantity:d.quantity,remainingBefore:9,remainingAfter:8,duplicateConfirmed:true}}};
}
function Fixture(){return <main className="mx-auto max-w-[760px] p-4 text-earth-800"><p className="mb-3 text-sm text-earth-600">本機合成預覽 · 不連線、不更動正式資料</p><PlanSessionAdjustment storeId="synthetic-store" card={{id:'synthetic-card',remaining:9,held:0,closed:false,expiresAt:'2027-12-31T15:59:59.999Z'}} port={{save,records:[original],members:[{id:'learner',name:'合成學員'}]}} unitLabel="堂" onPending={()=>{}} onSaved={()=>{}} onCancel={()=>{}}/></main>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
