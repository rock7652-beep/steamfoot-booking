'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSettingsPanelGuard} from './settings-panel-context';
import {PlanManagementControls} from './plan-management-controls';
import {closeSteamPlan} from '@/server/actions/steam-wallet-management';
export function SteamPlanClose({wallet,onSaved}:{wallet:{id:string;storeId:string;remainingSessions:number;expiryDate:Date|string|null;status:string};onSaved?:()=>void}){
 const [dirty,setDirty]=useState(false),[pending,setPending]=useState(false);const router=useRouter();
 useSettingsPanelGuard(dirty,pending);
 return <PlanManagementControls key={wallet.id+':'+wallet.remainingSessions+':'+wallet.status} storeId={wallet.storeId}
  card={{id:wallet.id,remaining:wallet.remainingSessions,expiresAt:wallet.expiryDate?new Date(wallet.expiryDate).toISOString():null,closed:!['ACTIVE','EXPIRED'].includes(wallet.status),held:0}}
  allowExpiry={false} save={closeSteamPlan} onDirtyChange={setDirty} onPending={setPending} onSaved={()=>{if(onSaved)onSaved();else router.refresh();}}/>;
}
