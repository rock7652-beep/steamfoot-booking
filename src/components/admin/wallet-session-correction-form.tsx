'use client';
import {useRef,useState} from 'react';
import {toast} from 'sonner';
import {formatTWTime} from '@/lib/date-utils';
import type {SessionRow} from '@/components/wallet-session-detail';
import type {WalletSessionCorrectionInput} from '@/lib/wallet-session-correction';
import {correctSteamWalletSession} from '@/server/actions/wallet-session-correction';
import {useSettingsPanelGuard} from './settings-panel-context';

export function WalletSessionCorrectionForm({session,storeId,customerId,walletId,onSaved,onCancel}:{session:SessionRow;storeId:string;customerId:string;walletId:string;onSaved:()=>void;onCancel:()=>void}){
  const [reason,setReason]=useState(''),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
  const frozen=useRef<WalletSessionCorrectionInput|null>(null),busy=useRef(false);
  useSettingsPanelGuard(!!reason,pending||uncertain);
  const originalDate=session.status==='BACKFILLED'?session.completedAt:session.voidedAt;
  async function save(){
    if(busy.current||!session.updatedAt||!['BACKFILLED','VOIDED'].includes(session.status)||(!frozen.current&&!reason.trim()))return;
    frozen.current??={expectedStoreId:storeId,customerId,walletId,sessionId:session.id,expectedStatus:session.status as 'BACKFILLED'|'VOIDED',expectedUpdatedAt:new Date(session.updatedAt).toISOString(),requestKey:crypto.randomUUID(),reason:reason.trim()};
    busy.current=true;setPending(true);setMessage('');
    try{
      const result=await correctSteamWalletSession(frozen.current);
      if(!result.success){setUncertain(!!result.uncertain);if(!result.uncertain)frozen.current=null;setMessage(result.error);return;}
      setUncertain(false);frozen.current=null;
      toast.success('已更正返還 1 堂');
      if(result.syncWarning)setMessage('已更正返還 1 堂，請重新開啟核對最新餘額；勿重複送出。');
      try{onSaved();}catch{setMessage('已更正返還 1 堂，畫面更新失敗，請重新開啟核對；勿重複送出。');}
    }catch{setUncertain(true);setMessage('結果待確認，請用原請求重試，勿另建更正。');}
    finally{busy.current=false;setPending(false);}
  }
  const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
  return <section aria-label="更正返還" className="my-2 space-y-2 rounded-lg border border-earth-200 p-3 text-sm">
    <h3 className="font-medium">更正第 {session.sessionNo} 堂{session.status==='BACKFILLED'?'補登':'註銷'}</h3>
    {originalDate&&<p>原日期：{formatTWTime(new Date(originalDate),{dateOnly:true})}</p>}
    <p>返還 1 堂並恢復空白格，保留原紀錄；不變更收款。</p>
    <label className="block">更正原因<textarea aria-label="更正原因" className="mt-1 min-h-20 w-full rounded-lg border border-earth-200 p-2" maxLength={200} value={reason} disabled={pending||uncertain} onChange={e=>setReason(e.target.value)}/></label>
    {message&&<p role="alert">{message}</p>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={pending||uncertain} onClick={onCancel}>取消</button><button type="button" className={button+' bg-primary-700 text-white'} disabled={pending||(!uncertain&&!reason.trim())} onClick={()=>void save()}>{pending?'處理中…':uncertain?'重試確認結果':'確認更正返還'}</button></div>
  </section>;
}
