// Synthetic UI preview only: no database, authentication or real scheduling.
import {createRoot} from 'react-dom/client';
import {SportsScheduleFields} from '../../src/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import {SportsScheduleDialog} from '../../src/app/(dashboard)/dashboard/courses/sports-schedule-dialog';
import type {SportsSnapshot} from '../../src/lib/sports-staging-types';
const qa=window as unknown as {qaCalls:unknown[];qaAction:(name:string,...args:unknown[])=>Promise<unknown>;failSave:boolean};
qa.qaCalls=[];
qa.qaAction=async(name,...args)=>{
 if(name==='sportsStagingCommand'){
  qa.qaCalls.push(args[0]);
  return qa.failSave?{success:false,error:'後續日期有衝突，請調整時間'}:{success:true};
 }
 throw Error('Blocked backend action '+name);
};
const initial:SportsSnapshot={storeId:'synthetic',date:'2026-11-10',subjects:[{id:'subject',templateId:'template',name:'舞蹈（常態課程）',category:'舞蹈',active:true,updatedAt:'v1'}],fees:[],lessons:[],students:[],customers:[{id:'student',name:'合成學員',phone:'0900000000'}],coaches:[{id:'coach',name:'合成老師',templates:['template']}],rooms:[{id:'room',name:'小教室',capacity:10,rental:true}]};
createRoot(document.getElementById('root')!).render(<SportsScheduleDialog busy={false} onClose={()=>{}}><SportsScheduleFields initial={initial} date="2026-11-10" seed={{single:true,coachId:'coach',time:'16:30'}} requestKey="00000000-0000-4000-8000-000000000001" onGuard={()=>{}} onCreated={()=>{}}/></SportsScheduleDialog>);
