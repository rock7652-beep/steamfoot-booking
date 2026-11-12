import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TeachingPlanFeeEditor} from '@/components/admin/teaching-plan-fee-editor';
import type {MusicTeacherSettings} from '@/lib/music-teacher-settings';
function Fixture(){
 const [ids,setIds]=useState<string[]>([]),[settings,setSettings]=useState<MusicTeacherSettings>({defaultRatio:null,subjectRules:{},revision:0});
 const templates=['A','B','C'].flatMap(id=>[{id:`item-${id}`,name:`${id} 類教學項目`,subjectName:`${id} 類教學項目`,musicSubjectId:id,isActive:true,currentTeaching:false,hasFee:false},{id:`version-${id}`,name:'歷史收費版本',subjectName:`${id} 類教學項目`,musicSubjectId:id,isActive:true}]);
 const plans=['A','B','C'].flatMap(subject=>Array.from({length:8},(_,index)=>({id:`${subject}${index+1}`,name:`${subject}${index+1} ${index===0?'長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用':'收費方案'}`,subjectIds:[subject],active:true,defaults:{[subject]:{mode:'SHARE' as const,value:60}}})));
 return <main className="mx-auto max-w-[1100px] space-y-3 p-4"><h1 className="text-xl font-semibold">授課資格與方案計酬 · 合成資料預覽</h1><p>24 個方案；無後端連線。</p><TeachingPlanFeeEditor templates={templates} plans={plans} qualificationIds={ids} settings={settings} fees={{}} onSettings={setSettings} onQualification={(id,on)=>setIds(old=>on?[...new Set([...old,id])]:old.filter(value=>value!==id))}/><output className="sr-only" aria-label="草稿資料">{JSON.stringify(settings.subjectRules)}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
