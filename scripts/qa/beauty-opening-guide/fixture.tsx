import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BeautyOpeningGuide} from '../../../src/components/beauty/opening-guide';
import {publishStoreProfileSaved} from '../../../src/lib/store-profile-sync';
import type {BeautyDashboardData} from '../../../src/server/beauty/queries';
import '../../../src/app/globals.css';
const store={name:'合成測試店',address:'合成地址',shopPhone:'合成電話'};
const fixtureData={storeId:'synthetic-store',openingHoursConfigured:true,chargeRulesActive:true,services:[{id:'s',name:'合成服務',active:true,duration:60,buffer:0,price:0,singlePriceConfigured:true}],techs:[{id:'t',name:'合成技師',active:true,serviceIds:['s']}],locations:[{isActive:true}],plans:[],access:{planAccess:true,staffAccess:true},policy:{selfBooking:false}} as unknown as BeautyDashboardData;
const button='min-h-11 rounded-lg border border-earth-200 px-3 text-sm';
function Fixture(){
 const [mode,setMode]=useState('new');const complete=mode==='complete';
 return <main className="mx-auto max-w-5xl space-y-4 p-4"><h1 className="text-xl font-semibold text-primary-900">設定</h1><p className="text-sm">初次開店引導・隔離畫面驗證。合成資料，沒有資料庫或實際設定寫入。</p>
 <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>setMode('new')}>未完成店家</button><button className={button} onClick={()=>setMode('complete')}>已完成店家</button><button className={button} onClick={()=>publishStoreProfileSaved('synthetic-store',store)}>模擬最後資料儲存確認</button><button className={button} onClick={()=>publishStoreProfileSaved('other-store',store)}>模擬其他店家確認</button></div>
 <section data-fixture="settings" className="min-w-0 space-y-3"><BeautyOpeningGuide key={mode} data={fixtureData} store={complete?store:{...store,address:''}}/><div className="rounded-lg border border-earth-200 bg-white p-4"><h2 className="font-semibold">店家資料</h2><p className="text-sm">店名、電話、地址</p><button className={button}>修改</button></div><div className="rounded-lg border border-earth-200 bg-white p-4"><h2 className="font-semibold">營業與預約</h2><p className="text-sm">後續直接使用原本設定，不保留固定的開店檢查功能。</p><button className={button}>修改</button></div></section>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
