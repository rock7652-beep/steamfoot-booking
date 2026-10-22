// Synthetic only: real shared components, no application login or database.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CourseSettingsWorkspace} from '../../src/app/(dashboard)/dashboard/courses/settings-workspace';
import {BeautySettingsWorkspace} from '../../src/components/beauty/settings-workspace';
import {BusinessAnalyticsView} from '../../src/app/(dashboard)/dashboard/courses/business-analytics-view';
import {CareFilters} from '../../src/app/(dashboard)/dashboard/growth/_components/care-filters';
import {beautyBusinessReport} from '../../src/lib/beauty/business-report';
import type {BeautyDashboardData} from '../../src/server/beauty/queries';
const data={storeId:'synthetic',policy:{selfBooking:true,selfCancel:true,selfReschedule:true,cancelDeduct:false,noShowDeduct:false,bookableDays:30,leadMinutes:0,cancelLeadMinutes:60,notifications:false},services:[],techs:[],locations:[],plans:[]} as unknown as BeautyDashboardData;
const store={section:'store' as const,name:'測試長名稱門市・原共用設定工作台',address:'台灣測試地址',shopPhone:'0900000000',mapUrl:'',lineOfficialUrl:'',lineOfficialId:''};
const report=beautyBusinessReport({visits:[{id:'v',customerId:'c',personName:'顧客',technicianId:'t',status:'COMPLETED',isTrial:true,startsAt:new Date('2026-10-03T01:00:00Z'),endsAt:new Date('2026-10-03T02:30:00Z')}],cards:[],customers:[{id:'c',name:'測試顧客長名稱・檢查名單換行'}],technicians:[{id:'t',name:'測試技師長名稱'}],rows:[{date:'2026-10-03',technicianId:'t',reserved:1,completed:1,trial:1,revenue:1000}],range:{startDate:'2026-10-01',endDate:'2026-10-31'},scope:{view:'store',person:'all'},createdDate:'2026-09-01',canCustomers:true,canPlans:true,finance:true,now:new Date('2026-10-22T01:00:00Z')});
function Fixture(){
 const [view,setView]=useState('settings'),[module,setModule]=useState('beauty');
 return <main className="min-w-0 p-3"><div className="mb-3 flex flex-wrap gap-3"><label>驗收頁面<select aria-label="驗收頁面" value={view} onChange={e=>setView(e.target.value)}><option value="settings">設定</option><option value="analytics">分析</option><option value="care">顧客經營</option></select></label><label>驗收模組<select aria-label="驗收模組" value={module} onChange={e=>setModule(e.target.value)}><option value="beauty">美業</option><option value="sports">運動</option><option value="music">音樂</option></select></label></div>
 <div className="min-w-0 md:ml-60">
 {view==='settings'&&(module==='beauty'?<BeautySettingsWorkspace data={data} slug="synthetic" initial={store} canEdit canPayment labels={<p>標籤共用入口</p>} subscription={<p>系統方案與用量</p>}/>:<CourseSettingsWorkspace storeId="synthetic" {...store} planLabel="系統方案" bankName="" bankCode="" bankAccountNumber="" bookingLeadMinutes={0} cancellationLeadMinutes={60} canEdit canPayment canStaff canPlans music={module==='music'}/>)}
 {view==='analytics'&&<BusinessAnalyticsView data={report} all beauty={module==='beauty'} music={module==='music'} statisticsNotes={module==='beauty'?<p>美業完成服務統計</p>:undefined}/>}
 {view==='care'&&<CareFilters month="2026-10" selected="birthday" counts={{birthday:2,inactive:3,low:1,expiring:1,trial:2}} baseHref={module==='beauty'?'/dashboard/beauty':'/dashboard/growth'} query={module==='beauty'?{tab:'顧客經營'}:{}}/>}
 </div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
