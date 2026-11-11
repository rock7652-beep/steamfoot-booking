// Synthetic read-only component preview; no account, backend or notification access.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CoursePhoneLearners} from '@/components/course-phone-learners';
import type {loadCoursePhoneSummary} from '@/server/actions/course-phone-summary';
import '../../src/app/(customer)/book/course-portal.css';
let phase=0;
function summary():Awaited<ReturnType<typeof loadCoursePhoneSummary>>{
 if(phase===3)return {success:true,sharedPlans:[],learners:[]};
 if(phase===5){
 const card={id:'shared-card',name:'共用鋼琴十堂方案',unit:'SESSION' as const,remaining:7,held:0,available:7,shared:true,closed:false,expired:false,expiresAt:null,activationDays:null,purchase:null,grid:{total:10,dates:['2026-11-01T02:00:00Z','2026-11-02T02:00:00Z','2026-11-03T02:00:00Z']}};
 return {success:true,learners:['A','B'].map(name=>({id:name,name:'孩子 '+name,cards:[card],upcoming:[],history:[]})),sharedPlans:[{card,learnerNames:['孩子 A','孩子 B']}]};
 }
 const backfilled=phase===1,voided=phase===4;
 return {success:true,sharedPlans:[],learners:[{id:'synthetic-child',name:'合成孩子 A',cards:[{id:'synthetic-card',name:'鋼琴八堂方案',unit:'SESSION',remaining:backfilled||voided?7:8,held:0,available:backfilled||voided?7:8,shared:false,closed:false,expired:false,expiresAt:'2027-01-24T15:59:59.999Z',activationDays:null,purchase:{date:'2026-10-27T02:00:00Z',amount:4800},grid:{total:8,dates:backfilled?['2026-11-09T16:00:00.000Z']:[],...(voided?{voidedDates:['2026-11-10T16:00:00Z']}:{})}}],upcoming:[],history:backfilled?[{id:'synthetic-backfill',name:'鋼琴八堂方案',startsAt:'2026-11-09T16:00:00.000Z',dateOnly:true,quantity:1,unitLabel:'堂',status:'已出席（補登）'}]:[]}]};
}
Object.assign(window,{__readPhoneSummary:async()=>{const response=summary();await new Promise(resolve=>setTimeout(resolve,150));return response;}});
function Fixture(){
 const [revision,setRevision]=useState(0);
 function update(value:number){phase=value;setRevision(n=>n+1);}
 return <main className="course-portal p-4"><p className="mb-3 text-sm">本機合成預覽 · 不連線、不更動正式資料</p><div className="mb-3 flex flex-wrap gap-2"><button onClick={()=>update(1)}>模擬後台補登</button><button onClick={()=>update(2)}>模擬更正返還</button><button onClick={()=>update(4)}>模擬註銷</button><button onClick={()=>update(5)}>模擬共用方案</button><button onClick={()=>update(3)}>模擬撤銷查看</button></div><CoursePhoneLearners scope="synthetic-store:synthetic-user" revision={revision}><p>原會員摘要</p></CoursePhoneLearners></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
