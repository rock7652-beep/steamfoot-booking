// Synthetic data only. The browser harness blocks every backend action.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CoursePortalClient} from '../../src/app/(customer)/book/course-portal-client';
import {CourseCardBrowser} from '../../src/app/(dashboard)/dashboard/courses/card-browser';
import {CourseCardProgress} from '../../src/app/(dashboard)/dashboard/courses/card-progress';
import {PanelReadProvider} from '../../src/components/operations/panel-read-cache';
import {useCustomerPlanPreload} from '../../src/components/admin/use-customer-plan-preload';
import type {CoursePortalData} from '../../src/app/(customer)/book/course-portal';
const params=new URLSearchParams(location.search),total=params.get('total')==='8'?8:10;
const grid={total,dates:params.has('attended')?['2026-11-03T03:00:00Z']:[]};
const card={id:'synthetic-card',name:'舞蹈（常態）-'+total+'堂',unit:'SESSION',termSessionIds:[],templateIds:[],allowShared:false,available:total,remaining:total,held:0,entries:[],expired:false,closed:false,expiresAt:'2027-01-24T00:00:00Z',members:[{id:'synthetic-member',name:'合成學員'}],grid};
const data={initialRole:'member',rolePreferenceKey:'grid-entrypoint-synthetic',month:'2026-11',serverNow:Date.parse('2026-11-10T11:00:00Z'),memberEnabled:true,hasWork:false,customerId:'synthetic-member',customerName:'合成學員',storeName:'合成店家',storeId:'synthetic-store',prefix:'/s/synthetic',cards:[card],plans:[],templates:[],bookings:[],orders:[],sessions:[],hours:[],special:[],config:{},bookingWindow:{closesAt:'2026-12-10T00:00:00Z'},nextBooking:null,nextWork:null,work:[],memberRecords:[],readOnly:true,initialView:'plans'} as unknown as CoursePortalData;
(window as unknown as {qaAction:(name:string)=>Promise<unknown>}).qaAction=async name=>{throw Error('Unexpected backend action '+name);};
function Admin(){
 const [open,setOpen]=useState(false),[ready,setReady]=useState(false);
 const preload=useCustomerPlanPreload({canReadCards:true,canReadBookings:true,storeId:'synthetic-store'});
 return <main className="p-6"><h1>顧客管理 · 合成學員</h1><button className="min-h-11 p-3" id="preload" onClick={async()=>{await preload.reader.read('synthetic-member');setReady(true)}}>預先讀取</button><span id="preload-state">{ready?'完成':''}</span><button className="min-h-11 p-3" id="open" onClick={()=>setOpen(v=>!v)}>開啟／關閉學員</button>{open&&<section id="customer-panel" className="mx-auto w-full max-w-[1100px] rounded-xl border p-5"><CourseCardBrowser customerId="synthetic-member" state={{search:'',history:false,page:0}} onChange={()=>{}} onSelect={()=>{}} overview canReadBookings renderProgress={c=><CourseCardProgress cardId={c.id} customerId="synthetic-member" storeId="synthetic-store"/>}/></section>}</main>;
}
createRoot(document.getElementById('root')!).render(params.get('mode')==='admin'?<PanelReadProvider><Admin/></PanelReadProvider>:<CoursePortalClient {...data} initialView="plans" readOnly/>);
