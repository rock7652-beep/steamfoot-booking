import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanManagementControls} from '@/components/admin/plan-management-controls';
import type {SessionAdjustmentInput,SessionAdjustmentRecord,SessionAdjustmentResult} from '@/lib/plan-session-adjustment';

function Fixture(){
  const label=new URLSearchParams(location.search).get('module')??'音樂';
  const [balance,setBalance]=useState(10);
  const save=async(d:SessionAdjustmentInput):Promise<SessionAdjustmentResult>=>{
    await new Promise(r=>setTimeout(r,120));
    const remaining=d.expectedRemaining+(d.operation==='REVERSE'?d.quantity:-d.quantity);
    const record:SessionAdjustmentRecord={id:d.requestKey,cardId:d.cardId,customerId:d.customerId,customerName:'隔離測試學員',operation:d.operation,quantity:d.quantity,occurredOn:d.occurredOn??null,reason:d.reason,recordedAt:new Date().toISOString(),actorName:'測試店長',reversalOf:d.reversalOf??null,remainingBefore:d.expectedRemaining,remainingAfter:remaining};
    setBalance(remaining);return {success:true,data:{record,remaining,expiresAt:'2027-12-31T15:59:59.999Z'}};
  };
  return <main className="mx-auto min-h-screen max-w-[560px] bg-white p-4 text-earth-800"><h1 className="text-xl font-semibold">{label} · 持有方案</h1><p className="my-3 text-base">長名稱課程方案 · 剩餘 {balance} {label==='美業'?'次':'堂'}</p><PlanManagementControls storeId="synthetic" card={{id:'synthetic',remaining:10,held:2,expiresAt:'2027-12-31T15:59:59.999Z',closed:false}} save={async()=>({success:false,error:'本預覽不測整張方案'})} sessionAdjustment={{save,records:[],members:[{id:'synthetic-learner',name:'隔離測試學員'}]}} unitLabel={label==='美業'?'次':'堂'} onSaved={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
