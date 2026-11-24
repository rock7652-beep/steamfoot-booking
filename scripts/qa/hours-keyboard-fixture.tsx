// Synthetic component preview: no database or external network.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ScheduleManager} from '../../src/app/(dashboard)/dashboard/settings/hours/schedule-manager';
import {CourseWeeklyHoursEditor} from '../../src/app/(dashboard)/dashboard/courses/hours/weekly-hours-editor';
const revision='a'.repeat(64);
const weekly=['週日','週一','週二','週三','週四','週五','週六'].map((dayName,dayOfWeek)=>({dayName,dayOfWeek,persisted:true,isOpen:true,openTime:'09:15',closeTime:'18:00',slotInterval:60,defaultCapacity:6,periods:[{openTime:'09:15',closeTime:'18:00',slotInterval:60,defaultCapacity:6}]}));
declare global{interface Window{hoursKeyboardCalls:Record<string,unknown>[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>}}
window.hoursKeyboardCalls=[];window.qaAction=async()=>{throw Error('Unexpected server action')};
window.fetch=async(_url,init)=>{const input=JSON.parse(String(init?.body));window.hoursKeyboardCalls.push(input);return {json:async()=>({success:false,error:'隔離測試儲存失敗，草稿已保留'})} as Response;};
const transport=async(input:Record<string,unknown>)=>{window.hoursKeyboardCalls.push(input);return {success:false,error:'隔離測試儲存失敗，草稿已保留'};};
function Fixture(){const [view,setView]=useState('steamfoot');return <main className="mx-auto max-w-5xl p-4"><p>隔離元件預覽，合成資料</p><label>模組<select aria-label="模組" className="min-h-11 border px-3" value={view} onChange={e=>setView(e.target.value)}><option value="steamfoot">蒸足</option><option value="course">課程</option><option value="beauty">美業</option></select></label>{view==='steamfoot'?<ScheduleManager storeId="synthetic" initialHoursRevision={revision} weeklyHours={weekly} initialSpecialDays={[]} initialSummary={{}} initialYear={2026} initialMonth={11} canManage isHeadquarters/>:<CourseWeeklyHoursEditor key={view} storeId="synthetic" initial={weekly} canManage onSaved={async()=>{}} source={{selectTimes:view==='beauty',transport,values:()=>({})}}/>}</main>};
createRoot(document.getElementById('root')!).render(<Fixture/>);
