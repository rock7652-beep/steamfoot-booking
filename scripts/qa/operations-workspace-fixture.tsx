// Synthetic data, actual shared navigation and financial presentation components.
import {useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {RevenueTabs} from '../../src/app/(dashboard)/dashboard/revenue/_components/revenue-tabs';
import {operationsArea} from '../../src/lib/operations-navigation';
import {BeautyRevenueBreakdownView} from '../../src/components/beauty/revenue-breakdown-view';
import {CourseMonthlyReport} from '../../src/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client';
import {CashDrawerDifferencesView} from '../../src/app/(dashboard)/dashboard/cash-drawer/cash-drawer-differences-view';
import {CashbookRecordFilters} from '../../src/app/(dashboard)/dashboard/cashbook/_components/cashbook-record-filters';
import DataExportClient from '../../src/app/(dashboard)/dashboard/data-export/data-export-client';
import {OperationsReceiptSummary} from '../../src/components/operations/receipt-summary';
import {DataTable} from '../../src/components/desktop';
const subscribe=(cb:()=>void)=>{window.addEventListener('qa-route',cb);return()=>window.removeEventListener('qa-route',cb);};
window.qaCalls=[];window.qaAction=async name=>{throw Error('Unexpected backend action '+name);};
document.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest('a');if(!target)return;event.preventDefault();history.replaceState(null,'',target.href);window.dispatchEvent(new Event('qa-route'));});
const income={storeId:'synthetic',storeName:'合成門市',from:'2026-10-01',to:'2026-10-27',totals:{count:2,gross:5000,refunds:500,net:4500,storeAmount:900,managerAmount:3600,unassignedAmount:0,unknownAmount:0,difference:0},managers:[{id:'manager',name:'合成店長長姓名與門市歸屬',count:2,gross:5000,refunds:500,net:4500,storeAmount:900,managerAmount:3600,unassignedAmount:0,unknownAmount:0,difference:0}],technicians:null,hasDifferences:false};
function Fixture(){
 const search=useSyncExternalStore(subscribe,()=>location.search),query=Object.fromEntries(new URLSearchParams(search));
 const area=operationsArea(query.area),[drawer,setDrawer]=useState(false),[restricted,setRestricted]=useState(false);
 return <OperationScope scope="qa:operations"><div className="flex min-h-screen min-w-0 bg-earth-50"><aside className="hidden w-56 shrink-0 border-r bg-white p-4 md:block">合成門市<br/>營運</aside><main className="min-w-0 flex-1 space-y-3 p-3">
 <header className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-semibold">營運</h1><button className="min-h-11 rounded-lg border px-3" onClick={()=>setDrawer(v=>!v)}>現金抽屜</button><label><input type="checkbox" checked={restricted} onChange={e=>setRestricted(e.target.checked)}/>僅匯出權限</label></header>
 <RevenueTabs active={area} query={query} available={restricted?['exports']:undefined}/>
 {area==='ledger'&&<section className="space-y-3"><OperationsReceiptSummary gross={5000} refunds={500} net={4500}><p>合成資料統計說明。</p></OperationsReceiptSummary><label>交易類型<select className="min-h-11 border px-3"><option>全部交易</option><option>方案購買</option><option>體驗交易</option></select></label><DataTable rows={[{id:'tx',name:'合成顧客',kind:'體驗',amount:'NT$ 500'}]} rowKey={r=>r.id} columns={[{key:'name',header:'顧客',accessor:r=>r.name},{key:'kind',header:'類型',accessor:r=>r.kind},{key:'amount',header:'金額',accessor:r=>r.amount}]}/></section>}
 {area==='income'&&<BeautyRevenueBreakdownView data={income}/>}
 {area==='cashbook'&&<section><h2 className="font-semibold">現金帳</h2><CashbookRecordFilters month={query.month??'2026-10'} kind="" keyword=""/><p>完整收支紀錄；點錢請使用現金抽屜。</p></section>}
 {area==='monthly'&&<section className="space-y-3"><h2 className="font-semibold">月結管理</h2><CourseMonthlyReport lines={[{kind:'FEE',id:'fee',staffId:'teacher',name:'合成老師長姓名',label:'合成課程／服務明細',date:'2026-10-20T03:00:00Z',amount:1500,paid:500,issue:null,payments:[]}]}/></section>}
 {area==='exports'&&<DataExportClient isAdmin={false} stores={[]} activeStoreId="synthetic" canCustomerExport canReportExport/>}
 {drawer&&<section aria-label="現金抽屜核對"><CashDrawerDifferencesView rows={[{id:'close',date:'2026-10-26',expected:5000,actual:4500,difference:-500,note:'合成差額原因，核對當日收款及找零紀錄'}]} issues={[{sessionId:'close',businessDate:'2026-10-26',saved:5000,current:5200,difference:200}]}/></section>}
 </main></div></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
