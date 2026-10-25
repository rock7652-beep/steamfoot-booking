// Synthetic local preview: production components, no application session or database.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CoursePlanDraftForm} from '../../src/app/(dashboard)/dashboard/courses/course-profile-forms';
import {OperationScope} from '../../src/components/operations/operation-scope';
const subjects=[{id:'subject',name:'教學項目・長名稱測試',category:'',isActive:true}];
const templates=[{id:'template',name:'一般教學項目',category:'',isActive:true,musicSubjectId:'subject',durationMinutes:60}];
const sports={storeId:'synthetic',date:'',subjects:[{id:'subject',name:'教學項目',category:'',active:true,updatedAt:'',templateId:'template'}],fees:[],lessons:[],students:[],customers:[],rooms:[],coaches:[{id:'teacher',name:'合格教練長名稱測試',templates:['template']}]};
function Preview(){const [module,setModule]=useState('music');return <OperationScope scope="synthetic"><main className="mx-auto max-w-3xl p-4"><label>驗收模組<select aria-label="驗收模組" value={module} onChange={e=>setModule(e.target.value)}><option value="music">音樂</option><option value="sports">運動</option></select></label><h1 className="my-4 text-xl">新增收費方式</h1><CoursePlanDraftForm key={module} storeId="synthetic" music={module==='music'} sportsData={module==='sports'?sports:undefined} subjects={subjects} templates={templates} musicTeachers={[{id:'teacher',name:'合格教師長名稱測試',active:true,qualificationIds:['template']}]} plan={null} termSessions={[]} profitEnabled={false} onPending={()=>{}} onSaved={()=>{}}/><button type="submit" form="course-member-form" className="my-3 min-h-11 rounded border px-4">儲存</button></main></OperationScope>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
