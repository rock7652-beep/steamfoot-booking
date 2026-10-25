import React from 'react';
import {createRoot} from 'react-dom/client';
import {CoursePlanDraftForm} from '@/app/(dashboard)/dashboard/courses/course-profile-forms';
import {MusicSubjectCatalog} from '@/app/(dashboard)/dashboard/courses/music-subject-catalog';
import {CourseSettingsWorkspace} from '@/app/(dashboard)/dashboard/courses/settings-workspace';
import {OperationScope} from '@/components/operations/operation-scope';
import {RightSheet} from '@/components/admin/right-sheet';
import '@/app/globals.css';
const mode={selfBookingEnabled:false,assignedSchedulingEnabled:true};
const subjects=[{id:'subject',name:'舞蹈（常態課程）',category:'舞蹈',isActive:true,description:'',updatedAt:'2026-10-25T00:00:00Z'}];
const coaches=[{id:'a',name:'合格老師甲',templates:['template']},{id:'b',name:'合格老師乙',templates:['template']},{id:'c',name:'未具資格人員',templates:[]}];
const templates=[{id:'template',name:'舞蹈',category:'',isActive:true,musicSubjectId:'subject',durationMinutes:60,classType:'GROUP'}];
const data={schedulingModes:mode,storeId:'fixture',date:'2026-10-25',subjects:[{...subjects[0],templateId:'template',active:true}],fees:[],lessons:[],students:[],customers:[],rooms:[],coaches};
const legacy={id:'legacy',name:'十堂舞蹈',points:10,price:5800,validDays:90,isActive:true,unit:'SESSION',templateIds:['template'],sportsMode:'LEGACY',sportsSubjectId:'subject',chargeSettings:{kind:'plan',durationMinutes:60,providerIds:['a'],trialPrice:null,trialDuration:null}};
const surface=new URLSearchParams(location.search).get('surface')??'fee';
function App(){if(surface==='subject')return <MusicSubjectCatalog schedulingModes={mode} storeId="fixture" sportsNative sportsCoaches={coaches.map(c=>({id:c.id,name:c.name}))} subjects={subjects} canCreate canEdit/>;
if(surface==='settings')return <CourseSettingsWorkspace storeId="fixture" name="合成運動店" planLabel="合成方案" address="" mapUrl="" lineOfficialUrl="" bankName="" bankCode="" bankAccountNumber="" bookingLeadMinutes={10} cancellationLeadMinutes={30} native selfBookingEnabled={false} assignedSchedulingEnabled canEdit={false} canPayment={false} canStaff={false} canPlans={false} canReminders={false} canReferralShare={false} canDigitalButler={false} waitlistFeatureAvailable waitlistSettings={{enabled:true,defaultLimit:5,autoPromoteStopMinutes:240}}/>;
return <RightSheet open presentation="centered" width={920} maxHeight={680} fitContent labelledById="preview-title" onClose={()=>{}}><h1 id="preview-title" className="border-b p-4">{surface==='legacy'?'編輯':'新增'}收費方式</h1><div className="min-h-0 flex-1 overflow-y-auto p-4"><OperationScope scope="fixture"><CoursePlanDraftForm storeId="fixture" sportsData={data} plan={surface==='legacy'?legacy:null} subjects={subjects} templates={templates} termSessions={[]} profitEnabled={false} onPending={()=>{}} onSaved={()=>{}}/></OperationScope></div><footer className="flex justify-end gap-3 border-t p-4"><button className="min-h-11 border px-4">取消</button><button className="min-h-11 border px-4" form="course-member-form">儲存</button></footer></RightSheet>}
createRoot(document.getElementById('root')).render(<main className="mx-auto min-w-0 max-w-[1440px] p-4"><App/></main>);
