"use client";
import {useState} from 'react';
import {MusicTeacherFeeEditor,type TeacherPlan,type TeacherFeeDraft} from './music-teacher-fee-editor';
import {compensationLabel,coursePlanRuleKey,type TeachingPlanChoice} from '@/lib/course-plan-compensation';
import type {MusicTeacherSettings} from '@/lib/music-teacher-settings';
import {teachingQualificationGroups} from '@/lib/teaching-qualification-groups';
import {resolveMusicTeacherRule} from '@/lib/music-teacher-settings';
const field='min-h-11 min-w-0 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm';
export function TeachingPlanFeeEditor({templates,plans,qualificationIds,settings,fees,onQualification,onSettings,qualificationReadOnly=false,readOnly=false,showFees=true}:{templates:TeacherPlan[];plans:TeachingPlanChoice[];qualificationIds:string[];settings:MusicTeacherSettings;fees:Record<string,TeacherFeeDraft>;onQualification:(id:string,selected:boolean)=>void;onSettings:(value:MusicTeacherSettings)=>void;qualificationReadOnly?:boolean;readOnly?:boolean;showFees?:boolean}){
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<string|null>(null);
 const groups=teachingQualificationGroups(templates).filter(group=>group.ids.some(id=>qualificationIds.includes(id)));
 const visiblePlans=plans.filter(plan=>plan.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <div className="space-y-4">
  <MusicTeacherFeeEditor templates={templates} qualificationIds={qualificationIds} fees={{}} settings={settings} showFees={false} initiallyExpanded onFees={()=>{}} onSettings={()=>{}} onQualification={onQualification} qualificationReadOnly={qualificationReadOnly}/>
  {showFees&&<section className="space-y-2"><h3 className="font-medium text-primary-900">各收費方案計酬</h3><input aria-label="搜尋收費方案" placeholder="搜尋收費方案" className={field} value={search} onChange={e=>setSearch(e.target.value)}/>
   {!groups.length&&<p className="py-3 text-sm text-earth-500">先勾選可教授教學項目。</p>}
   {groups.map(group=><section key={group.key} className="overflow-hidden rounded-lg border border-earth-200"><h4 className="bg-earth-50 px-3 py-2 text-sm font-medium">{group.name}</h4>
    {visiblePlans.filter(plan=>plan.subjectIds.includes(group.key)).map(plan=>{
     const key=coursePlanRuleKey(plan.id),individual=settings.subjectRules[key];
     const template=templates.find(t=>group.ids.includes(t.id)&&plan.templateIds?.includes(t.id));
     const draft=template?fees[template.id]:undefined;
     const legacy=template?resolveMusicTeacherRule(draft&&draft.mode!=='INHERIT'?{mode:draft.mode,value:Number(draft.value)}:null,group.key,settings,template.musicTeacherShare).rule:null;
     const inherited=plan.legacy?legacy??plan.defaults[group.key]:plan.defaults[group.key];
     const effective=individual??inherited;
     const rowKey=`${group.key}:${plan.id}`;
     const change=(mode:string,value:number)=>{const next={...settings.subjectRules};if(mode==='INHERIT')delete next[key];else next[key]={mode:mode as 'SHARE'|'CLASS',value};onSettings({...settings,subjectRules:next});};
     return <div key={plan.id} className="admin-striped-row border-t border-earth-100 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words text-sm">{plan.name}{!plan.active&&'（已下架）'}</span><span className="text-sm text-earth-600">{individual?'個別設定':plan.legacy?'沿用舊約定':`沿用${group.name}`} · {compensationLabel(effective)}</span><button type="button" disabled={readOnly} aria-expanded={editing===rowKey} className="min-h-11 px-3 text-sm text-primary-800 disabled:opacity-50" onClick={()=>setEditing(editing===rowKey?null:rowKey)}>修改</button></div>
      {editing===rowKey&&<div className="grid gap-2 pb-2 sm:grid-cols-2"><label className="text-sm">計酬方式<select className={field} aria-label={`${plan.name}計酬方式`} disabled={readOnly} value={individual?.mode??'INHERIT'} onChange={e=>change(e.target.value,e.target.value==='SHARE'?60:0)}><option value="INHERIT">{plan.legacy?'沿用舊約定':`沿用${group.name}預設`}</option><option value="SHARE">比例拆帳（%）</option><option value="CLASS">固定費用（元／次）</option></select></label>{individual&&<label className="text-sm">{individual.mode==='CLASS'?'固定費用（元／次）':'比例拆帳（%）'}<input className={field} aria-label={`${plan.name}計酬數值`} disabled={readOnly} required type="number" min={0} max={individual.mode==='SHARE'?100:1000000} step={individual.mode==='SHARE'?0.01:1} value={Number.isFinite(individual.value)?individual.value:""} onChange={e=>change(individual.mode,e.target.valueAsNumber)}/></label>}</div>}
     </div>;
    })}
    {!visiblePlans.some(plan=>plan.subjectIds.includes(group.key))&&<p className="px-3 py-3 text-sm text-earth-500">沒有符合的收費方案</p>}
   </section>)}
   <p className="text-sm text-earth-500">固定費用每場計一次，不依時間或人數倍增；既有課次保留原計酬。</p>
  </section>}
 </div>;
}
