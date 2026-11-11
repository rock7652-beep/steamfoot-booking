// Real readers, caches and visible plan components; only the transport is simulated.
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PanelReadProvider,useInvalidateCustomerPlanReads,usePanelReadCache} from '@/components/operations/panel-read-cache';
import {useCustomerPlanPreload} from '@/components/admin/use-customer-plan-preload';
import {useBeautyNativePlanProgressReader} from '@/components/beauty/use-native-plan-progress-reader';
import {BeautyPlanProgress} from '@/components/beauty/plan-progress';
import {CourseCardBrowser} from '@/app/(dashboard)/dashboard/courses/card-browser';
import {CourseCardProgress} from '@/app/(dashboard)/dashboard/courses/card-progress';
import {CustomerPanelSessions} from '@/app/(dashboard)/dashboard/customers/_components/customer-panel-sessions';
import {callSnapshot,readModel,mutateModel,modelVersion,remaining,transportDelayMs} from './plan-flow-benchmark-model';
import type {browseCourseCards} from '@/server/actions/course-browse';
import type {PlanUsageProgress} from '@/lib/plan-usage-progress';
const state={search:'',history:false,page:0};
const moduleName=new URLSearchParams(window.location.search).get('module')??'steam';
const storeId='synthetic-'+moduleName;
// The cast bridges the mocked transport union; no application implementation is replaced.
const readCards:typeof browseCourseCards=()=>readModel('cards') as ReturnType<typeof browseCourseCards>;
type Detail={progress:PlanUsageProgress;remaining:number;price:number};
const readDetail=()=>readModel('detail') as Promise<Detail>;
function Fixture(){
 const [open,setOpen]=useState(false),[version,setVersion]=useState(0),[preloaded,setPreloaded]=useState(false),[detail,setDetail]=useState<{version:number;data:Detail}>();
 const invalidate=useInvalidateCustomerPlanReads();
 const beauty=useBeautyNativePlanProgressReader(storeId);
 const loadProgress=useCallback((customerId:string,cardId:string,revision:number)=>beauty.read(storeId,customerId,cardId,revision),[beauty]);
 const getProgress=useCallback((customerId:string,cardId:string,revision:number)=>beauty.get(storeId,customerId,cardId,revision),[beauty]);
 const options=useMemo(()=>({...(moduleName==='beauty'?{load:readCards,preloadCardProgress:loadProgress,getCardProgress:getProgress}:{}),music:moduleName==='music',canReadCards:true,canReadBookings:true,canReadTransactions:true,storeId}),[loadProgress,getProgress]);
 const preload=useCustomerPlanPreload(options);
 const steam=usePanelReadCache('customer-detail',readDetail,storeId);
 useEffect(()=>{if(!open||moduleName!=='steam')return;let active=true;void steam.load('customer').then(data=>{if(active)setDetail({version,data});});return()=>{active=false;};},[open,steam,version]);
 const cached=moduleName==='steam'?steam.get('customer'):undefined;
 const visibleDetail=cached??(detail?.version===version?detail.data:undefined);
 useEffect(()=>{Object.assign(window,{planFlow:{calls:callSnapshot,version:modelVersion,transportDelayMs,ready:()=>moduleName==='steam'?!!steam.get('customer'):preload.reader.get('customer')}});},[steam,preload]);
 async function prepare(){if(moduleName==='steam')await steam.load('customer');else await preload.reader.read('customer');setPreloaded(true);}
 function change(){setOpen(false);mutateModel();setVersion(modelVersion());setPreloaded(false);steam.invalidate('customer');invalidate();}
 return <main className="mx-auto max-w-3xl space-y-3 p-3"><h1>合成資料讀取驗證 · {moduleName}</h1><p>固定模擬讀取延遲 {transportDelayMs}ms；不連線正式資料。</p><div className="flex flex-wrap gap-2"><button data-action="open" onClick={()=>setOpen(true)}>開啟</button><button data-action="close" onClick={()=>setOpen(false)}>關閉</button><button data-action="preload" onClick={()=>void prepare()}>預讀</button><button data-action="change" onClick={change}>模擬異動</button></div><p data-preloaded={preloaded}>預讀：{preloaded?'完成':'未完成'} · 版本 {version}</p>
 {open&&<section data-panel className="rounded border bg-white p-3">
 {moduleName==='steam'?visibleDetail?<><p data-balance>剩餘 {visibleDetail.remaining} 堂 · 可預約 {visibleDetail.remaining-1} 堂</p><p>方案金額 NT$ {visibleDetail.price.toLocaleString()}</p><CustomerPanelSessions customerId="customer" walletId="card" totalSessions={10} remainingSessions={visibleDetail.remaining} initialProgress={visibleDetail.progress}/></>:<p role="status">讀取顧客資料中…</p>:<CourseCardBrowser overview native customerId="customer" state={state} onChange={()=>{}} onSelect={()=>{}} load={moduleName==='beauty'?readCards:undefined} renderProgress={()=>moduleName==='beauty'?<BeautyPlanProgress cardId="card" storeId={storeId} customerId="customer" scope={storeId}/>:<CourseCardProgress showSummary={false} cardId="card" customerId="customer" storeId={storeId}/>} />}
 <span data-expected-balance={remaining()} hidden />
 </section>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<PanelReadProvider><Fixture/></PanelReadProvider>);
