"use client";
import {useId,useState} from 'react';
import {MusicTeacherFeeEditor,type TeacherPlan,type TeacherFeeDraft} from './music-teacher-fee-editor';
import {compensationLabel,coursePlanRuleKey,type TeachingPlanChoice} from '@/lib/course-plan-compensation';
import type {MusicTeacherSettings} from '@/lib/music-teacher-settings';
import {teachingQualificationGroups} from '@/lib/teaching-qualification-groups';
import {resolveMusicTeacherRule} from '@/lib/music-teacher-settings';
const field='min-h-11 min-w-0 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm';
export function TeachingPlanFeeEditor({templates,plans,qualificationIds,settings,fees,onQualification,onSettings,qualificationReadOnly=false,readOnly=false,showFees=true}:{templates:TeacherPlan[];plans:TeachingPlanChoice[];qualificationIds:string[];settings:MusicTeacherSettings;fees:Record<string,TeacherFeeDraft>;onQualification:(id:string,selected:boolean)=>void;onSettings:(value:MusicTeacherSettings)=>void;qualificationReadOnly?:boolean;readOnly?:boolean;showFees?:boolean}){
 const tabsId=useId();
 const [pane,setPane]=useState<'qualifications'|'fees'>('qualifications');
 const activePane=showFees?pane:'qualifications';
 const [search,setSearch]=useState(''),[editing,setEditing]=useState<string|null>(null);
 const groups=teachingQualificationGroups(templates).filter(group=>group.ids.some(id=>qualificationIds.includes(id)));
 const visiblePlans=plans.filter(plan=>plan.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <div className="space-y-4" onInvalidCapture={event=>{const target=event.target as HTMLElement;const panel=target.closest<HTMLElement>('[data-teaching-pane]');if(panel){setPane(panel.dataset.teachingPane as 'qualifications'|'fees');requestAnimationFrame(()=>{target.focus({preventScroll:true});target.scrollIntoView?.({block:"nearest"});});}}}>
  {showFees&&<nav role="tablist" aria-label="授課與計酬分頁" className="sticky top-0 z-10 grid grid-cols-2 gap-1 rounded-lg bg-earth-50 p-1">{([['qualifications','授課資格'],['fees','方案計酬']] as const).map(([id,label],index)=><button key={id} type="button" role="tab" id={`${tabsId}-${id}-tab`} aria-controls={`${tabsId}-${id}-panel`} aria-selected={activePane===id} tabIndex={activePane===id?0:-1} className={`min-h-11 rounded-md px-3 text-sm ${activePane===id?'bg-white font-medium text-primary-900 shadow-sm':'text-earth-600'}`} onClick={()=>setPane(id)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%2:event.key==='ArrowLeft'?(index+1)%2:event.key==='Home'?0:event.key==='End'?1:null;if(next===null)return;event.preventDefault();setPane(next===0?'qualifications':'fees');event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>{label}</button>)}</nav>}
  <section id={`${tabsId}-qualifications-panel`} role={showFees?'tabpanel':undefined} aria-labelledby={showFees?`${tabsId}-qualifications-tab`:undefined} data-teaching-pane="qualifications" hidden={activePane!=='qualifications'}>
  <MusicTeacherFeeEditor templates={templates} qualificationIds={qualificationIds} fees={{}} settings={settings} showFees={false} initiallyExpanded onFees={()=>{}} onSettings={()=>{}} onQualification={onQualification} qualificationReadOnly={qualificationReadOnly}/>
  </section>
  {showFees&&<section id={`${tabsId}-fees-panel`} role="tabpanel" aria-labelledby={`${tabsId}-fees-tab`} data-teaching-pane="fees" hidden={activePane!=='fees'} className="space-y-2"><h3 className="font-medium text-primary-900">各收費方案計酬</h3><input aria-label="搜尋收費方案" placeholder="搜尋收費方案" className={field} value={search} onChange={e=>setSearch(e.target.value)}/>
   {!groups.length&&<p className="py-3 text-sm text-earth-500">先勾選可教授教學項目。<button type="button" className="min-h-11 px-3 text-primary-800" onClick={()=>setPane('qualifications')}>選擇授課資格</button></p>}
   {groups.map(group=><section key={group.key} className="overflow-hidden rounded-lg border border-earth-200"><h4 className="bg-earth-50 px-3 py-2 text-sm font-medium">{group.name}</h4>
    {visiblePlans.filter(plan=>plan.subjectIds.includes(group.key)).map(plan=>{
     const key=coursePlanRuleKey(plan.id),individual=settings.subjectRules[key];
     const template=templates.find(t=>group.ids.includes(t.id)&&plan.templateIds?.includes(t.id));
     const draft=template?fees[template.id]:undefined;
     const legacy=template?resolveMusicTeacherRule(draft&&draft.mode!=='INHERIT'?{mode:draft.mode,value:Number(draft.value)}:null,group.key,settings,template.musicTeacherShare).rule:null;
     const usingLegacy=!!plan.legacy&&!plan.defaults[group.key];
     const inherited=plan.defaults[group.key]??(plan.legacy?legacy:null);
     const effective=individual??inherited;
     const rowKey=`${group.key}:${plan.id}`;
     const change=(mode:string,value:number)=>{const next={...settings.subjectRules};if(mode==='INHERIT')delete next[key];else next[key]={mode:mode as 'SHARE'|'CLASS',value};onSettings({...settings,subjectRules:next});};
     return <div key={plan.id} className="admin-striped-row border-t border-earth-100 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words text-sm">{plan.name}{!plan.active&&'（已下架）'}</span><span className="text-sm text-earth-600">{individual?'個別設定':usingLegacy?'沿用舊約定':`沿用${group.name}`} · {compensationLabel(effective)}</span><button type="button" disabled={readOnly} aria-expanded={editing===rowKey} className="min-h-11 px-3 text-sm text-primary-800 disabled:opacity-50" onClick={()=>setEditing(editing===rowKey?null:rowKey)}>修改</button></div>
      {editing===rowKey&&<div className="grid gap-2 pb-2 sm:grid-cols-2"><label className="text-sm">計酬方式<select className={field} aria-label={`${plan.name}計酬方式`} disabled={readOnly} value={individual?.mode??'INHERIT'} onChange={e=>change(e.target.value,e.target.value==='SHARE'?60:0)}><option value="INHERIT">{usingLegacy?'沿用舊約定':`沿用${group.name}預設`}</option>{individual?.mode==='HOUR'&&<option value="HOUR">保留舊約定（元／小時）</option>}<option value="SHARE">比例拆帳（%）</option><option value="CLASS">固定費用（元／次）</option></select></label>{individual&&<label className="text-sm">{individual.mode==='CLASS'?'固定費用（元／次）':individual.mode==='HOUR'?'保留舊約定（元／小時）':'比例拆帳（%）'}<input className={field} aria-label={`${plan.name}計酬數值`} disabled={readOnly||individual.mode==='HOUR'} required type="number" min={0} max={individual.mode==='SHARE'?100:1000000} step={individual.mode==='SHARE'?0.01:1} value={Number.isFinite(individual.value)?individual.value:""} onChange={e=>change(individual.mode,e.target.valueAsNumber)}/></label>}</div>}
     </div>;
    })}
    {!visiblePlans.some(plan=>plan.subjectIds.includes(group.key))&&<p className="px-3 py-3 text-sm text-earth-500">沒有符合的收費方案</p>}
   </section>)}
   <p className="text-sm text-earth-500">固定費用每場計一次，不依時間或人數倍增；既有課次保留原計酬。</p>
  </section>}
 </div>;
}
