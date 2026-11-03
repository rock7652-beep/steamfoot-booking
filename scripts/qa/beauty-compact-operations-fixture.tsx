// Actual presentation components, synthetic records and stubbed actions only.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RevenueReportClient} from '../../src/components/reports/RevenueReportClient';
import {Toaster} from 'sonner';
import {OperationsFrame,OperationsControls} from '../../src/components/operations/workspace-frame';
import {RevenueTabs} from '../../src/app/(dashboard)/dashboard/revenue/_components/revenue-tabs';
import {BeautyRevenueBreakdownView} from '../../src/components/beauty/revenue-breakdown-view';
import {beautyRevenueBreakdown} from '../../src/lib/beauty/revenue-breakdown';
import {CashbookRecordFilters} from '../../src/app/(dashboard)/dashboard/cashbook/_components/cashbook-record-filters';
import {IncomeMonthFilter} from '../../src/components/income-month-filter';
import DataExportClient from '../../src/app/(dashboard)/dashboard/data-export/data-export-client';
import {CustomersToolbar} from '../../src/app/(dashboard)/dashboard/customers/_components/customers-toolbar';
import {CustomerLabelsProvider} from '../../src/components/customer-labels';
import {DaySlotManager} from '../../src/app/(dashboard)/dashboard/bookings/day-slot-manager';
import {InstantFilterForm} from '../../src/components/instant-filter-form';
import {OperationScope} from '../../src/components/operations/operation-scope';
import type {OperationsArea} from '../../src/lib/operations-navigation';

const qa=window as unknown as {qaCalls:unknown[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>;failLoad:boolean;failSave:boolean;previewRestricted:boolean};
qa.qaCalls=[];
qa.qaAction=async(name,...args)=>{
 qa.qaCalls.push({name,args});
 if(name==='getDaySlotDetails'){
  if(qa.failLoad)throw Error('Synthetic load failure');
  if(qa.previewRestricted && args[0] !== '2030-11-03')return {slots:[],writeRestriction:'Synthetic preview restriction',previewWriteDate:'2030-11-03'};
  return {status:'open',defaultCapacity:6,hoursRevision:'synthetic-revision',canAddSlotsOnClosedDay:false,slots:['09:00','09:30','10:00','10:30','11:00'].map(startTime=>({startTime,capacity:6,isEnabled:true,inRange:true,override:null}))};
 }
 if(name==='applyDaySlotOverrides')return qa.failSave?{success:false,error:'合成儲存失敗，草稿已保留'}:{success:true,data:{changed:1,bookedPeopleKept:1}};
 throw Error('Blocked backend action '+name);
};
const labels={available:true,enabled:true,canEdit:false,canManage:false,categories:[{id:'category',name:'類型',number:1,position:0,active:true}],labels:[{id:'vip',categoryId:'category',name:'VIP',active:true}],assignments:{}};
const data={storeId:'synthetic',storeName:'合成門市',from:'2026-11-01',to:'2026-11-30',...beautyRevenueBreakdown([{staffId:'manager',coachName:'合成店長',netAmount:5000,refund:false,saleAllocation:{storeAmount:1000,managerAmount:4000,unassignedAmount:0,unknownAmount:0}}]),technicians:null};
function Fixture(){
 const [view,setView]=useState('income');
 const active:OperationsArea=['ledger','income','cashbook','monthly','exports'].includes(view)?view as OperationsArea:'exports';
 const ledger=<><InstantFilterForm id="qa-ledger"><input type="hidden" name="area" value="ledger"/><OperationsControls><label>開始<input type="date" aria-label="開始日期" form="qa-ledger" name="dateFrom" defaultValue="2026-11-01"/></label><label>結束<input type="date" aria-label="結束日期" form="qa-ledger" name="dateTo" defaultValue="2026-11-30"/></label></OperationsControls><label>狀態<select name="status" defaultValue="CONFIRMED"><option value="CONFIRMED">已收款</option><option value="">全部</option></select></label></InstantFilterForm><p>合成營收明細</p></>;
 return <OperationScope scope="qa:compact"><CustomerLabelsProvider initial={labels}><Toaster/><div className="flex min-h-screen bg-earth-50 text-earth-800"><aside className="hidden w-64 shrink-0 border-r bg-white p-6 lg:block">蒸管家 · 合成預覽</aside><main className="min-w-0 flex-1 p-4"><label className="mb-4 block">驗收頁面<select aria-label="驗收頁面" value={view} onChange={e=>setView(e.target.value)}>{['ledger','income','cashbook','monthly','exports','reports','customers','slots','course-customers'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
 {view==='customers'||view==='course-customers'?<CustomersToolbar beautyMode={view==='customers'} labelsInMore courseMode basePath="/dashboard/beauty?tab=顧客管理" staffOptions={[{id:'manager',displayName:'合成店長'}]}/>:view==='slots'?<DaySlotManager hideCapacity expectedStoreId="synthetic" date="2026-11-03" bookedPeopleBySlot={new Map()} onSaved={()=>{}}/>:<OperationsFrame tabs={<RevenueTabs active={active} beautyLedger query={{dateFrom:'2026-11-01',dateTo:'2026-11-30'}}/>}>
  {view==='reports'?<RevenueReportClient serviceMode courseMode mode="store" stores={[{id:'synthetic',name:'合成門市'}]} coaches={[]} isAdmin={false} canExportData={false} defaultStartDate="2026-11-01" defaultEndDate="2026-11-30"/>:view==='income'?<BeautyRevenueBreakdownView data={data}/>:view==='cashbook'?<><div className="flex items-center justify-between"><h2>現金帳</h2><button className="min-h-11 rounded border px-3">＋ 新增記帳</button></div><CashbookRecordFilters month="2026-11" kind="" keyword=""/><p>合成現金帳紀錄</p></>:view==='monthly'?<><IncomeMonthFilter month="2026-11"/><p>合成月結明細</p></>:view==='exports'?<DataExportClient serviceMode courseMode isAdmin={false} stores={[]} activeStoreId="synthetic" canCustomerExport canReportExport initialStartDate="2026-11-01" initialEndDate="2026-11-30"/>:ledger}
 </OperationsFrame>}
 </main></div></CustomerLabelsProvider></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
