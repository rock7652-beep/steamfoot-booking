import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PageHeader} from '@/components/desktop';
import {CourseHomeBookingActions} from '@/components/course-home-booking-actions';
import {CustomersToolbar} from '@/app/(dashboard)/dashboard/customers/_components/customers-toolbar';
import {CustomerLabelsProvider} from '@/components/customer-labels';
import {ExclusiveMenu} from '@/components/admin/exclusive-menu';
const labels={available:true,enabled:true,canEdit:false,canManage:false,categories:[{id:'type',name:'類型',number:1,position:0,active:true}],labels:[{id:'vip',categoryId:'type',name:'VIP',active:true}],assignments:{}};
function Fixture(){
 const [view,setView]=useState('fitness-home');
 const music=view.startsWith('music'),beauty=view.startsWith('beauty'),home=view.endsWith('home');
 return <CustomerLabelsProvider initial={labels}><div className="flex min-h-screen bg-earth-50 text-earth-800"><aside className="hidden w-60 shrink-0 border-r bg-white p-4 lg:block">蒸管家 · 合成資料預覽</aside><main className="min-w-0 flex-1 p-4 sm:p-8">
  <label className="mb-4 block text-sm">驗收頁面<select aria-label="驗收頁面" value={view} onChange={event=>setView(event.target.value)}>{['fitness-home','music-home','fitness-customers','music-customers','beauty-customers'].map(value=><option key={value}>{value}</option>)}</select></label>
  {home?<PageHeader title="首頁" actions={<CourseHomeBookingActions scheduleHref="/dashboard/courses?date=2026-11-03"/>}/>:<><PageHeader title="顧客管理"/><CustomersToolbar key={view} beautyMode={beauty} courseMode musicMode={music} labelsInMore={!beauty} basePath={beauty?'/dashboard/beauty?tab=顧客管理':'/dashboard/courses?view=customers'} staffOptions={music?[]:[{id:'owner',displayName:'合成店長'}]} trailing={<ExclusiveMenu label="顧客管理更多操作" triggerText="⋯"><button type="button" className="min-h-11 w-full">匯出顧客</button></ExclusiveMenu>}/></>}
 </main></div></CustomerLabelsProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
