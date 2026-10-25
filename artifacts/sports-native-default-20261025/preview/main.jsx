import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SportsScheduleFields} from '@/app/(dashboard)/dashboard/courses/sports-schedule-fields';
import '@/app/globals.css';
const data={storeId:'fixture',date:'2026-10-25',subjects:[{id:'subject',templateId:'template',name:'瑜珈',category:'運動',active:true}],fees:[],lessons:[],students:[],customers:[{id:'student',name:'學員',phone:'0900000000'}],coaches:[{id:'coach',name:'教練',templates:['template']}],rooms:[{id:'room',name:'A',capacity:10,rental:true}]};
function App(){const[open,setOpen]=useState(true);return <main className="mx-auto max-w-[1100px] p-4"><button className="mb-4 min-h-11 rounded-lg border px-4" onClick={()=>setOpen(false)}>關閉開放選課</button><SportsScheduleFields initial={data} schedulingModes={{selfBookingEnabled:open,assignedSchedulingEnabled:true}} date="2026-10-25" seed={{time:'15:30'}} requestKey="00000000-0000-4000-8000-000000000001" onGuard={()=>{}} onCreated={()=>{}}/></main>}
createRoot(document.getElementById('root')).render(<App/>);
