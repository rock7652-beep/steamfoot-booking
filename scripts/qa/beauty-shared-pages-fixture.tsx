import {CourseLowBalanceSettings} from '../../src/app/(dashboard)/dashboard/courses/reminders/low-balance-settings';
import {TrialCareCard} from '../../src/app/(dashboard)/dashboard/reminders/trial-care-card';
import {defaultTrialCareRules} from '../../src/lib/trial-care';
declare global {interface Window {reminderSaves?:unknown[]}}
async function saveSyntheticPlan(input:unknown){(window.reminderSaves??=[]).push(input);return {success:true,revision:Number((input as {expectedRevision?:number}).expectedRevision??0)+1};}
async function saveSyntheticCare(input:unknown){(window.reminderSaves??=[]).push(input);return {success:true,revision:'synthetic-revision'};}
import {ReminderCenter} from '../../src/components/admin/reminder-center';
import {NotificationLogList} from '../../src/app/(dashboard)/dashboard/reminders/notification-log-list';
import {LineNotificationRecipientsCard} from '../../src/app/(dashboard)/dashboard/reminders/line-notification-recipients-card';
import {ConsumptionFiltersForm} from '../../src/app/(dashboard)/dashboard/growth/consumption/consumption-filters';
import {ConsumptionResults} from '../../src/app/(dashboard)/dashboard/growth/consumption/consumption-results';
import {parseConsumptionFilters} from '../../src/lib/customer-consumption';
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
 const [view,setView]=useState('settings'),[module,setModule]=useState('beauty'),[reminderTab,setReminderTab]=useState('logs'),[readOnly,setReadOnly]=useState(false);
 const filters=parseConsumptionFilters({},'2026-10-22');
 const metrics=module==='beauty'?['count','amount','paid'] as const:['count','sessions','amount','paid'] as const;
 return <main className="min-w-0 p-3"><div className="mb-3 flex flex-wrap gap-3"><label>驗收頁面<select aria-label="驗收頁面" value={view} onChange={e=>setView(e.target.value)}><option value="settings">設定</option><option value="analytics">分析</option><option value="care">顧客經營</option><option value="consumption">期間消耗統計</option><option value="reminders">提醒中心</option><option value="reminder-settings">提醒設定</option><option value="manager-settings">店長通知設定</option></select></label><label>驗收模組<select aria-label="驗收模組" value={module} onChange={e=>setModule(e.target.value)}><option value="beauty">美業</option><option value="sports">運動</option><option value="music">音樂</option></select></label></div>
<label><input type="checkbox" aria-label="唯讀驗收" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)}/>唯讀</label>
 <div className="min-w-0 md:ml-60">
 {view==='settings'&&(module==='beauty'?<BeautySettingsWorkspace data={data} slug="synthetic" initial={store} canEdit canPayment labels={<p>標籤共用入口</p>} subscription={<p>系統方案與用量</p>}/>:<CourseSettingsWorkspace storeId="synthetic" {...store} planLabel="系統方案" bankName="" bankCode="" bankAccountNumber="" bookingLeadMinutes={0} cancellationLeadMinutes={60} canEdit canPayment canStaff canPlans music={module==='music'}/>)}
 {view==='analytics'&&<BusinessAnalyticsView data={report} all beauty={module==='beauty'} music={module==='music'} statisticsNotes={module==='beauty'?<p>美業完成服務統計</p>:undefined}/>}
 {view==='care'&&<CareFilters month="2026-10" selected="birthday" counts={{birthday:2,inactive:3,low:1,expiring:1,trial:2}} baseHref={module==='beauty'?'/dashboard/beauty':'/dashboard/growth'} query={module==='beauty'?{tab:'顧客經營'}:{}}/>}
 {view==='consumption'&&<><ConsumptionFiltersForm filters={filters} params={{}} options={[{id:'plan',name:'測試長名稱十次家人共用方案',unit:module==='beauty'?'VISIT':'SESSION'}]} staffOptions={[{id:'staff',name:'測試店長'}]} metrics={[...metrics]} beauty={module==='beauty'}/><ConsumptionResults rows={[{id:'customer',name:'測試顧客長名稱・家人共用',phone:'0900000000',assignedStaffName:'測試店長',count:3,sessions:3,grids:0,points:0,amount:1000,paid:5000,balances:'測試長名稱方案（共用）：剩餘 7 次／到期 2026-12-31'}]} total={1} matched={1} page={1} filters={filters} metrics={[...metrics]} canExport beautyMode={module==='beauty'} courseMode={module!=='beauty'}/></>}
 {view==='reminders'&&<><select aria-label="驗收提醒頁籤" value={reminderTab} onChange={e=>setReminderTab(e.target.value)}><option value="logs">紀錄</option><option value="manager">店長</option></select><ReminderCenter storeId="synthetic" active={reminderTab} explicit baseHref={module==='beauty'?'/dashboard/beauty/reminders':'/dashboard/courses/reminders'} returnHref="/dashboard/beauty?tab=設定" subtitle="提醒與紀錄" enabled blockedMessage="LINE 維持關閉；此為合成驗收資料。">
 {reminderTab==='manager'?<LineNotificationRecipientsCard storeId="synthetic" readOnly={module==='beauty'} bindingUnavailable="隔離測試不建立 LINE 綁定" recipients={Array.from({length:25},(_,i)=>({id:String(i),displayName:'通知人員測試長名稱 '+i,roleLabel:'店長',isActive:false,linkedAt:null,sameDayBookingEnabled:false,preferences:{}}))}/>:<NotificationLogList beauty={module==='beauty'} course={module!=='beauty'} params={{}} baseHref={module==='beauty'?'/dashboard/beauty/reminders':'/dashboard/courses/reminders'} typeLabels={{BOOKED:'預約成立'}} data={{page:1,hasMore:false,typeOptions:['BOOKED'],rows:[{id:'event',audience:'customer',recipient:'測試長名稱顧客',type:'BOOKED',status:'SKIPPED',body:'測試訊息內容',error:null,at:new Date('2026-10-22T01:00Z'),customerId:'customer',channel:'LINE',responseAction:null,planName:null,managerStatus:null,managerError:null}]}}/>}
 </ReminderCenter></>}
 {view==='manager-settings'&&<LineNotificationRecipientsCard storeId="synthetic" beauty={module==='beauty'} course={module!=='beauty'} readOnly={readOnly} bindingUnavailable="LINE 維持關閉，不建立綁定或發送。" recipients={Array.from({length:25},(_,i)=>({id:'synthetic-manager-'+i,displayName:'測試通知人員長名稱 '+i,roleLabel:'店長',isActive:i%3!==0,linkedAt:new Date('2026-10-22T01:00Z'),sameDayBookingEnabled:false,preferences:{trial:false,payment:false,incomplete:false,digest:false}}))}/>}
 {view==='reminder-settings'&&<><CourseLowBalanceSettings key={module} storeId="synthetic" beauty={module==='beauty'} music={module==='music'} readOnly={readOnly} saveSetting={saveSyntheticPlan} plans={Array.from({length:25},(_,i)=>({id:'plan'+i,name:'提醒方案測試長名稱 '+String(i).padStart(2,'0'),unit:module==='beauty'?'VISIT':'SESSION',isActive:i<22,lowBalanceEnabled:false,lowBalanceThreshold:null,revision:0,expiry:{enabled:module!=='beauty',days:[14,7]}}))}/><TrialCareCard key={module+':care'} storeId="synthetic" storeName="美業體驗關懷測試店" initialEnabled={false} initialRules={defaultTrialCareRules()} logs={[]} deliveryBlocked readOnly={readOnly} saveSettings={saveSyntheticCare}/></>}
 </div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
