// Local component Preview only. All authority and persistence below are synthetic.
import {useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {RightSheet} from '../../src/components/admin/right-sheet';
import {CourseStaffAvailabilityEditor,type CourseAvailabilitySaveHandle} from '../../src/app/(dashboard)/dashboard/courses/course-staff-availability-editor';
import {ScheduleManager} from '../../src/app/(dashboard)/dashboard/settings/hours/schedule-manager';
const noop=()=>{},a='a'.repeat(64),b='b'.repeat(64);
let weekly=['週日','週一','週二','週三','週四','週五','週六'].map((dayName,dayOfWeek)=>({dayName,dayOfWeek,persisted:true,isOpen:true,openTime:'09:15',closeTime:'18:00',slotInterval:30,defaultCapacity:1,periods:[{openTime:'09:15',closeTime:'18:00',slotInterval:30,defaultCapacity:1}]}));
declare global{interface Window{qaCalls:{name:string;args:unknown[]}[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>}}
window.qaCalls=[];window.qaAction=async(name,...args)=>{window.qaCalls.push({name,args});if(name.includes('SpecialDays'))return [];return {};};
window.fetch=async(_url,init)=>{const input=JSON.parse(String(init?.body));window.qaCalls.push({name:'business-save',args:[input]});
 weekly=weekly.map(day=>{const changed=input.values.weeklyDays.find((c:{dayOfWeek:number})=>c.dayOfWeek===day.dayOfWeek);return changed?{...day,...changed,persisted:true,openTime:changed.periods[0]?.openTime??null,closeTime:changed.periods.at(-1)?.closeTime??null,periods:changed.periods.map((p:{openTime:string;closeTime:string})=>({...p,slotInterval:30,defaultCapacity:1}))}:day;});
 return {ok:true,json:async()=>({success:true,storeId:'synthetic',data:{day:{hoursRevision:b},weekly}})} as Response;};
const staffSource={selectTimes:true,reasonEnabled:false,read:async()=>({revision:a,inheritStoreHours:false,weekly:weekly.map(d=>({dayOfWeek:d.dayOfWeek,periods:d.periods})),exceptions:[],retainedSessions:[]}),save:async(input:Record<string,unknown>)=>{window.qaCalls.push({name:'staff-save',args:[input]});return {success:true,storeId:'synthetic',data:{revision:b,inheritStoreHours:false,weekly:(input.values as {days:unknown}).days,exceptions:[],retainedSessions:[]}};}};
function Fixture(){const [view,setView]=useState('staff');const save=useRef<CourseAvailabilitySaveHandle>(null);
 return <OperationScope scope="qa:beauty:daily"><main className="min-w-0 p-3"><label>驗收頁面<select aria-label="驗收頁面" value={view} onChange={e=>setView(e.target.value)}><option value="staff">技師時間</option><option value="hours">營業時間</option></select></label>
 {view==='staff'?<RightSheet open presentation="centered" className="fitness-management-editor" fitContent width={920} maxHeight={680} onClose={noop} labelledById="daily-title"><header className="shrink-0 border-b px-4 py-3"><h2 id="daily-title">技師服務時間</h2></header><div className="min-h-0 flex-1 overflow-y-auto p-3"><CourseStaffAvailabilityEditor storeId="synthetic" staffId="tech" fitness source={staffSource} externalSave saveRef={save}/></div><footer className="shrink-0 border-t bg-white p-3 text-right"><button className="min-h-11 rounded border px-3" onClick={()=>save.current?.save()}>儲存技師時間</button></footer></RightSheet>:<ScheduleManager storeId="synthetic" initialHoursRevision={a} weeklyHours={weekly} initialSpecialDays={[]} initialSummary={{}} initialYear={2026} initialMonth={10} canManage isHeadquarters={false} isBeautyStore/>}
 </main></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
