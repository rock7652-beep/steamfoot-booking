'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {PlanGridActions,type PlanGridAction} from './plan-grid-actions';
import {SteamPlanManagement} from './steam-plan-management';
/** Legacy direct customer route delegates to the same management core. */
export function SteamPlanOperations({wallet,customerId,available}:{wallet:{id:string;storeId:string;plan:{name:string};remainingSessions:number;expiryDate:Date|string|null;startDate:Date|string;status:string};customerId:string;available:number;reserved:number}){
 const [pending,setPending]=useState(false);
 const [action,setAction]=useState<PlanGridAction|'history'|null>(null),router=useRouter(),active=['ACTIVE','EXPIRED'].includes(wallet.status);
 return <section className="min-w-0 space-y-2 px-3 pb-3" aria-label="方案操作"><PlanGridActions disabled={pending} label={wallet.plan.name} allowSession={wallet.status==='ACTIVE'&&available>0} allowExpiry={active&&!!wallet.expiryDate} allowClose={active} onSelect={setAction} onHistory={()=>setAction('history')}/>{action&&<SteamPlanManagement onPending={setPending} customerId={customerId} customerName="顧客" walletId={wallet.id} storeId={wallet.storeId} action={action} onCancel={()=>setAction(null)} onSaved={()=>{setAction(null);router.refresh();}}/>}</section>;
}
