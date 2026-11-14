"use client";
import {useCallback,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {PlanGridActions,type PlanGridAction} from "./plan-grid-actions";
import {SettingsPanelContext,useSettingsPanelGuard,type SettingsPanelState} from "./settings-panel-context";
import {SteamPlanVoid} from "./steam-plan-void";
import {SteamPlanClose} from "./steam-plan-close";
import {BackfillUsedSessionsForm} from "@/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form";
import {ExtendWalletExpiryForm} from "@/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form";
import {toLocalDateStr} from "@/lib/date-utils";

/** Direct customer URLs use the same actions and original Steam transactions as the drawer. */
export function SteamPlanOperations({wallet,customerId,available,reserved}:{wallet:{id:string;storeId:string;plan:{name:string};remainingSessions:number;expiryDate:Date|string|null;startDate:Date|string;status:string};customerId:string;available:number;reserved:number}){
 const [action,setAction]=useState<PlanGridAction|null>(null),[guard,setGuard]=useState({dirty:false,pending:false});
 const states=useRef(new Map<string,SettingsPanelState>()),router=useRouter();
 const report=useCallback((id:string,state:SettingsPanelState|null)=>{if(state)states.current.set(id,state);else states.current.delete(id);const values=[...states.current.values()];setGuard({dirty:values.some(value=>value.dirty),pending:values.some(value=>value.pending)});},[]);
 useSettingsPanelGuard(guard.dirty,guard.pending);
 const cancel=()=>{if(!guard.pending)setAction(null);};
 const saved=()=>{setAction(null);router.refresh();};
 if(!['ACTIVE','EXPIRED'].includes(wallet.status))return null;
 return <SettingsPanelContext.Provider value={{report,navigate:()=>{}}}><section className="min-w-0 space-y-2 px-3 pb-3" aria-label="方案操作">
  <PlanGridActions label={wallet.plan.name} disabled={guard.pending} allowSession={wallet.status==='ACTIVE'&&available>0} allowExpiry={!!wallet.expiryDate} onSelect={value=>{if(!guard.pending)setAction(value);}}/>
  {action==='BACKFILL'&&<BackfillUsedSessionsForm controlledOpen onOpenChange={open=>{if(!open)cancel();}} walletId={wallet.id} available={available} reserved={reserved} startDateLocal={toLocalDateStr(new Date(wallet.startDate))} onSuccess={saved}/>}
  {action==='VOID'&&<SteamPlanVoid customerId={customerId} walletId={wallet.id} planName={wallet.plan.name} onSaved={saved} onCancel={cancel}/>}
  {action==='expiry'&&wallet.expiryDate&&<ExtendWalletExpiryForm controlledOpen onOpenChange={open=>{if(!open)cancel();}} walletId={wallet.id} currentExpiry={toLocalDateStr(new Date(wallet.expiryDate))} expired={wallet.status==='EXPIRED'} onSuccess={saved}/>}
  {action==='close'&&<SteamPlanClose wallet={wallet} initialAction="close" showActions={false} onSaved={saved} onCancel={cancel}/>}
 </section></SettingsPanelContext.Provider>;
}
