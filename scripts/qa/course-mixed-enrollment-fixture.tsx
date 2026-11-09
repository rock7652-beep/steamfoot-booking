// Isolated UI preview: all server actions are stubbed by the browser runner.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {MusicScheduleWizard} from "../../src/app/(dashboard)/dashboard/courses/music-schedule-wizard";
import {SportsScheduleFields} from "../../src/app/(dashboard)/dashboard/courses/sports-schedule-fields";
import "../../src/app/globals.css";
const customers=Array.from({length:30},(_,i)=>({id:`student-${i}`,name:i===0?"固定學員甲":"測試學員長名稱"+i,phone:`090000${String(i).padStart(4,"0")}`}));
const subjects=[{id:"subject",name:"合奏與節奏訓練",category:"教學",active:true,isActive:true,updatedAt:"fixture",templateId:"template"}];
const coaches=[{id:"coach",name:"測試老師",displayName:"測試老師",templates:["template"]}];
const rooms=[{id:"room",name:"教室 A",capacity:8,rental:true}];
const snapshot={storeId:"synthetic",date:"2099-01-01",subjects,coaches,rooms,customers,students:[],fees:[],lessons:[]};
function Preview(){
 const [module,setModule]=useState("音樂"),[notice,setNotice]=useState("");
 const created=()=>setNotice("已確認新增（隔離測試）");
 return <main className="mx-auto max-w-5xl p-3 text-earth-800">
  <nav className="mb-3 flex gap-2">{["音樂","運動"].map(name=><button key={name} className="min-h-11 rounded border px-4" onClick={()=>{setModule(name);setNotice("");}}>{name}</button>)}</nav>
  <h1 className="mb-3 text-base font-semibold">{module}混合排課 · 隔離預覽</h1>
  <section className="h-[calc(100dvh-11rem)] min-w-0 rounded-lg bg-white p-3">
   {module==="音樂"?<MusicScheduleWizard templates={[{id:"template",name:subjects[0].name,musicSubjectId:"subject",musicSubject:subjects[0],durationMinutes:60,capacity:8,defaultRoomId:null}]} rooms={rooms} coaches={coaches} initialDate="2099-01-01" initialTemplateId="template" initialLearner={{customerId:"student-0",cardId:"",name:customers[0].name}} seed={{time:"09:00",roomId:"room",coachId:"coach"}} requestKey="00000000-0000-4000-8000-000000000001" onCreated={created}/>:<SportsScheduleFields initial={snapshot} date="2099-01-01" seed={{time:"09:00",roomId:"room",coachId:"coach",customerId:"student-0"}} requestKey="00000000-0000-4000-8000-000000000002" onGuard={()=>{}} onCreated={created}/>}
  </section><output aria-label="預覽結果">{notice}</output>
 </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
