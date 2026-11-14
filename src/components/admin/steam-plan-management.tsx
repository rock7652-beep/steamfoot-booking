'use client';
import {useEffect,useState} from 'react';
import {PlanManagementControls} from './plan-management-controls';
import type {PlanGridAction} from './plan-grid-actions';
import {useSettingsPanelGuard} from './settings-panel-context';
import {readSteamPlanOperations,saveSteamSessionAdjustment} from '@/server/actions/steam-session-adjustment';
import {saveSteamPlanManagement} from '@/server/actions/steam-wallet-management';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {WalletSessionDetail} from '@/components/wallet-session-detail';

type Result=Awaited<ReturnType<typeof readSteamPlanOperations>>;
/** One management form shared with Music, Sports and Beauty; only the data port differs. */
export function SteamPlanManagement({customerId,customerName,walletId,storeId,action,onCancel,onSaved,readOnly=false,onPending}:{customerId:string;customerName:string;walletId:string;storeId:string;action:PlanGridAction|'history';onCancel:()=>void;onSaved:()=>void;readOnly?:boolean;onPending?:(pending:boolean)=>void}){
 const [result,setResult]=useState<Result|null>(null),[revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false);
 useSettingsPanelGuard(dirty,pending);
 const reader=usePanelReader('steam-plan-operations',readSteamPlanOperations,JSON.stringify([storeId,customerId,walletId,revision]),0);
 useEffect(()=>{let active=true;reader.read(customerId,walletId).then(r=>{if(active)setResult(r);}).catch(()=>{if(active)setResult({success:false,error:'讀取失敗，請重試'});});return()=>{active=false;};},[customerId,walletId,revision,reader]);
 if(!result)return <p role="status" className="py-2 text-sm">讀取方案資料中…</p>;
 if(!result.success)return <p role="alert" className="text-sm text-red-700">{result.error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>{setResult(null);setRevision(n=>n+1);}}>重試</button></p>;
 const data=result.data;
 if(action!=='history'&&(readOnly||data.wallet.closed))return <p role="alert">此方案目前無法修改</p>;
 return <PlanManagementControls key={action+':'+revision} compactActions showActions={false} storeId={storeId} card={data.wallet} save={saveSteamPlanManagement} initialAction={action} unitLabel="堂" allowExpiry={!!data.wallet.expiresAt}
  sessionAdjustment={{save:saveSteamSessionAdjustment,records:data.records,members:[{id:customerId,name:customerName}],readOnly:readOnly||data.wallet.closed,blockedReason:!data.wallet.active&&action!=='history'?'僅有效方案可調整額度':undefined}}
  history={<WalletSessionDetail sessions={data.sessions.map(s=>({...s,updatedAt:new Date(s.updatedAt),reservedAt:s.reservedAt?new Date(s.reservedAt):null,completedAt:s.completedAt?new Date(s.completedAt):null,voidedAt:s.voidedAt?new Date(s.voidedAt):null,booking:s.booking?{...s.booking,bookingDate:new Date(s.booking.bookingDate)}:null}))}/>}
  onDirtyChange={setDirty} onPending={value=>{setPending(value);onPending?.(value);}} onCancel={onCancel} onSaved={()=>{setDirty(false);setResult(null);setRevision(n=>n+1);onSaved();}}/>;
}
