// Full native component with synthetic data; every backend/network operation is intercepted.
import {createRoot} from 'react-dom/client';
import {CourseRoster} from '@/app/(dashboard)/dashboard/courses/roster';
import {preparedRoster} from '@/__tests__/fixtures/prepared-roster';
import {PanelReadProvider} from '@/components/operations/panel-read-cache';
const query=new URLSearchParams(location.search),mode=query.get('mode')==='OPEN'?'OPEN':'ASSIGNED',music=query.get('profile')==='MUSIC';
const data=preparedRoster();data.session.enrollmentMode=mode;data.customers=[{id:'new-student',name:'待加入學員',phone:'0911111111'}];
data.roster[0].customerName='原有學員';
window.fetch=async()=>new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
const state={actions:[] as Array<{name:string;args:unknown[]}>};
Object.assign(window,{qaState:state,qaAction:async(name:string,...args:unknown[])=>{state.actions.push({name,args});if(name==='previewCourseEnrollment')return {success:true,sessions:[]};if(name==='loadCourseRosterQuick')return {success:true,data:{...data,teacherNote:data.session.teacherNote,teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',waitlistStopMinutes:0}};return {success:false,error:'合成驗收：已記錄送出，未寫入任何資料'};}});
createRoot(document.getElementById('root')!).render(<PanelReadProvider><main className="p-4"><section className="mx-auto max-w-[1100px] rounded-xl border bg-white p-3"><h1>{music?'音樂':'運動'}・{mode==='ASSIGNED'?'指定學員':'開放選課'}</h1><CourseRoster sessionId="synthetic-capacity" capacity={1} canCreate canEdit sportsNative={!music} musicLayout={music} view="member-booking"/></section></main></PanelReadProvider>);
