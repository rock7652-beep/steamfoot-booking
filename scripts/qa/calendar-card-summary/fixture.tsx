import {createRoot} from 'react-dom/client';
import {useState,type ComponentProps} from 'react';
import {CourseScheduleBoard} from '../../../src/app/(dashboard)/dashboard/courses/course-schedule-board';
import {ScheduleSummaryButton} from '../../../src/components/admin/schedule-summary-button';
import '../../../src/app/globals.css';
const session={id:'lesson',templateId:'template',nameSnapshot:'合成鋼琴課・長課程名稱驗證',startsAt:'2026-11-04T01:00:00Z',endsAt:'2026-11-04T02:00:00Z',coachId:'coach',roomId:'room',capacity:1,pointCost:1,bookings:[{customerId:'student',customerName:'合成學員王同學',status:'RESERVED',bookingKind:'REGULAR'}]};
const button='min-h-11 rounded-lg border border-earth-200 px-3 text-sm';
function Fixture(){
 const [profile,setProfile]=useState<'MUSIC'|'FITNESS'>('MUSIC'),[mode,setMode]=useState<'day'|'week'>('week'),[opened,setOpened]=useState(0);
 const props:ComponentProps<typeof CourseScheduleBoard>={businessProfile:profile,sportsNative:profile==='FITNESS',mode,selectedDate:'2026-11-04',today:'2026-11-04',initialResourceView:'room',rooms:[{id:'room',name:'合成教室 A',isActive:true}],coaches:[{id:'coach',displayName:profile==='MUSIC'?'合成老師':'合成教練',status:'ACTIVE',courseCoachEnabled:true}],templates:[{id:'template',name:'合成課程',classType:profile==='MUSIC'?'PRIVATE':'GROUP'}],sessions:[{...session,nameSnapshot:profile==='MUSIC'?session.nameSnapshot:'合成瑜珈團體課',capacity:profile==='MUSIC'?1:8}],storePeriods:[{openTime:'08:00',closeTime:'20:00'}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:()=>{},onSelectDate:()=>{},onOpenSession:()=>setOpened(v=>v+1)};
 return <main className="min-w-0 space-y-3 p-4"><h1 className="text-xl font-semibold text-primary-900">課表資訊小卡</h1><p className="text-sm">隔離視覺預覽：真實課表元件、合成資料、無伺服器業務讀寫。移動查詢與導覽為展示替身。</p><div className="flex flex-wrap gap-2">{(['MUSIC','FITNESS'] as const).map(v=><button className={button} key={v} onClick={()=>setProfile(v)}>{v}</button>)}{(['day','week'] as const).map(v=><button className={button} key={v} onClick={()=>setMode(v)}>{v}</button>)}<span role="status">明細開啟次數 {opened}</span></div><CourseScheduleBoard key={`${profile}:${mode}`} {...props}/><div data-fixture="edge" className="flex justify-end"><ScheduleSummaryButton className={button} summary={<><p className="font-semibold">邊緣與長文字定位驗證</p><p>{'合成課程名稱與教室資訊，測試白色小卡不會超出視窗。'.repeat(3)}</p></>} onClick={()=>setOpened(v=>v+1)}>月表共用小卡觸發器</ScheduleSummaryButton></div></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
