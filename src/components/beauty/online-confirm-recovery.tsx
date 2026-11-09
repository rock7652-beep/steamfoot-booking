'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ModalPanel} from '@/components/admin/modal-panel';
import {createBeautyOnlineConfirmRecovery,type OnlineConfirmEntry,type OnlineConfirmPointer,type OnlineConfirmPort,type OnlineConfirmSnapshot} from '@/lib/beauty-online-confirm-recovery';
import {prepareBeautyOnlineConfirm,readBeautyOnlineConfirm,cancelBeautyOnlineConfirm,commitBeautyOnlineConfirm,acknowledgeBeautyOnlineConfirm,listBeautyOnlineConfirm} from '@/server/actions/beauty-online-confirm-intent';

const Context=createContext<{open:(orderId:string)=>void;disabled:boolean}|null>(null);
export function useBeautyOnlineConfirm(){return useContext(Context);}
const btn='min-h-11 rounded-lg border border-earth-300 px-3 py-2 text-sm disabled:opacity-50';
const timeout=<T,>(work:()=>Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),8000);Promise.resolve().then(work).then(x=>{clearTimeout(timer);resolve(x);},e=>{clearTimeout(timer);reject(e);});});
type Controller=ReturnType<typeof createBeautyOnlineConfirmRecovery>;
type Screen=OnlineConfirmSnapshot|{kind:'checking'};

/** Mounts at the ledger root, so a successful order disappearing from the
 * pending list does not remove the operator's unacknowledged result. */
export function BeautyOnlineConfirmProvider({storeId,userId,children}:{storeId:string;userId:string;children:React.ReactNode}){
 const router=useRouter(),[screen,setScreen]=useState<Screen>({kind:'checking'}),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
 const current=useRef<Controller|null>(null),running=useRef(false),generation=useRef(0);
 useEffect(()=>{
  const generationRef=generation,version=++generationRef.current;setScreen({kind:'checking'});setSelected('');setBusy(false);running.current=false;
  try{
   const port:OnlineConfirmPort={
    list:s=>timeout(()=>listBeautyOnlineConfirm(s)),read:s=>timeout(()=>readBeautyOnlineConfirm(s)),prepare:s=>timeout(()=>prepareBeautyOnlineConfirm(s)),
    commit:s=>timeout(()=>commitBeautyOnlineConfirm(s)),cancel:s=>timeout(()=>cancelBeautyOnlineConfirm(s)),acknowledge:s=>timeout(()=>acknowledgeBeautyOnlineConfirm(s)),
   };
   const controller=createBeautyOnlineConfirmRecovery({storeId,userId,storage:window.sessionStorage,randomUUID:()=>crypto.randomUUID(),port});current.current=controller;
   void controller.inspect().then(state=>{if(generation.current===version)setScreen(state);});
  }catch{setScreen({kind:'uncertain',reason:'storage'});}
  return()=>{++generationRef.current;current.current=null;};
 },[storeId,userId]);
 const run=useCallback(async(work:(c:Controller)=>Promise<OnlineConfirmSnapshot>)=>{
  const c=current.current;if(!c||running.current)return;const version=generation.current;running.current=true;setBusy(true);
  try{const result=await work(c);if(version===generation.current)setScreen(result);return version===generation.current?result:undefined;}
  finally{if(version===generation.current){running.current=false;setBusy(false);}}
 },[]);
 const open=useCallback((orderId:string)=>{if(screen.kind!=='ready'||busy)return;const existing=screen.entries.find(x=>x.orderId===orderId);if(existing){setSelected(orderId);return;}if(screen.entries.length||screen.localMissing)return;setSelected(orderId);void run(c=>c.start(orderId));},[screen,busy,run]);
 const entries=screen.kind==='ready'?screen.entries:[],localMissing=screen.kind==='ready'?screen.localMissing:null;
 const selectedEntry=entries.find(e=>e.orderId===selected);
 const disabled=busy||screen.kind!=='ready'||!!localMissing||entries.length>0;
 const act=(entry:OnlineConfirmPointer,op:'commit'|'cancel'|'acknowledge'|'clearCancelled')=>void run(c=>c[op]({orderId:entry.orderId,requestKey:entry.requestKey})).then(r=>{if(r?.kind==='ready'&&!r.entries.length&&!r.localMissing){setSelected('');router.refresh();}});
 const inspect=()=>void run(c=>c.inspect());
 const renderEntry=(entry:OnlineConfirmEntry,modal=false)=><div key={entry.orderId+entry.requestKey} className="space-y-2 rounded-lg border border-earth-200 bg-white p-3">
  <p className="break-words font-medium">{entry.customerName} · {entry.planName}</p><p>金額：{entry.amount===null?'待核對':`NT$ ${entry.amount.toLocaleString('zh-TW')}`}</p>
  <p>{entry.status==='PREPARED'?'本次核帳請求尚未確認，請核對訂單狀態。':entry.status==='COMMITTED'||entry.status==='ACKNOWLEDGED'?'核帳請求已完成，請勿重複收款；後續異動請查看交易紀錄。':'原核帳請求已安全取消，請核對訂單狀態。'}</p>
  {entry.status==='PREPARED'&&!entry.canCommit&&<p role="alert">訂單摘要不完整，請聯絡管理員核對。</p>}
  <div className="flex flex-wrap gap-2">
   {entry.status==='PREPARED'&&entry.canCommit&&<button className={btn} disabled={busy} onClick={()=>act(entry,'commit')}>確認核帳並發卡</button>}
   {entry.status==='PREPARED'&&<button className={btn} disabled={busy} onClick={()=>act(entry,'cancel')}>安全取消本次核帳</button>}
   {entry.status==='COMMITTED'&&<button className={btn} disabled={busy} onClick={()=>act(entry,'acknowledge')}>確認已核帳</button>}
   {entry.status==='CANCELLED'&&<button className={btn} disabled={busy} onClick={()=>act(entry,'clearCancelled')}>確認取消</button>}
   {entry.status==='ACKNOWLEDGED'&&<button className={btn} disabled={busy} onClick={()=>act(entry,'acknowledge')}>確認已核帳</button>}
   {!modal&&<button className={btn} disabled={busy} onClick={inspect}>重新核對</button>}
  </div>
 </div>;
 return <Context.Provider value={{open,disabled}}>
  {screen.kind==='checking'&&<p role="status" className="rounded-lg bg-earth-50 p-3">正在核對線上核帳狀態…</p>}
  {screen.kind==='uncertain'&&<section role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>核帳結果尚未確認；請勿重複核帳。{screen.reason==='storage'?'無法讀取本機請求，請聯絡管理員核對。':'可重新查詢原請求。'}</p><button className={btn} disabled={busy} onClick={inspect}>重新核對</button></section>}
  {localMissing&&<section role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>原核帳請求尚未查到；晚到請求仍可能執行，請勿再次核帳。</p><div className="flex flex-wrap gap-2"><button className={btn} disabled={busy} onClick={inspect}>重新核對</button><button className={btn} disabled={busy} onClick={()=>act(localMissing,'cancel')}>安全取消原請求</button></div></section>}
  {entries.length>0&&!selected&&<section aria-label="待確認核帳" className="space-y-2 rounded-lg bg-amber-50 p-3"><p>有尚未確認的線上核帳，請先核對。</p>{entries.map(e=>renderEntry(e))}</section>}
  {children}
  {selected&&<ModalPanel open width={620} labelledById="beauty-online-confirm-title" pending={busy} onClose={()=>!busy&&setSelected('')}><header className="flex items-center justify-between border-b p-4"><h2 id="beauty-online-confirm-title" className="font-semibold">線上訂單核帳</h2><button className={btn} disabled={busy} onClick={()=>setSelected('')}>關閉</button></header><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">{busy?<p role="status">正在核對…</p>:selectedEntry?renderEntry(selectedEntry,true):<><p role="alert">核帳結果尚未確認，請勿重複核帳。</p><button className={btn} onClick={inspect}>重新核對</button>{localMissing&&<button className={btn} onClick={()=>act(localMissing,'cancel')}>安全取消原請求</button>}</>}</div></ModalPanel>}
 </Context.Provider>;
}
