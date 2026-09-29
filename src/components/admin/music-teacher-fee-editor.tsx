"use client";
import type { CompensationRule } from "@/lib/course-compensation";
import {resolveMusicTeacherRule,type MusicTeacherSettings} from "@/lib/music-teacher-settings";
export type TeacherFeeDraft={mode:"CLASS"|"SHARE"|"INHERIT";value:string;revision:number};
export type TeacherPlan={id:string;name:string;musicSubjectId?:string|null;subjectName?:string;musicTeacherShare?:number|null};
const input="min-h-10 rounded-lg border border-earth-200 bg-white px-2 text-sm";
function RuleInput({label,rule,onChange,disabled=false}:{disabled?:boolean;label:string;rule:CompensationRule|null;onChange:(r:CompensationRule|null)=>void}) {
 return <div className="flex flex-wrap items-center gap-2"><select disabled={disabled} className={input} aria-label={`${label}計酬方式`} value={rule?.mode??"INHERIT"} onChange={e=>onChange(e.target.value==="INHERIT"?null:{mode:e.target.value as "CLASS"|"SHARE",value:e.target.value==="SHARE"?60:0})}><option value="INHERIT">沿用上層設定</option><option value="SHARE">個別比例</option><option value="CLASS">整堂固定費</option></select>{rule&&<><input disabled={disabled} className={`${input} w-24`} aria-label={`${label}計酬數值`} type="number" min="0" max={rule.mode==="SHARE"?1:1000000} step={rule.mode==="SHARE"?0.0001:1} value={rule.mode==="SHARE"?rule.value/100:rule.value} onChange={e=>onChange({...rule,value:Number(e.target.value)*(rule.mode==="SHARE"?100:1)})}/><span className="text-xs text-earth-500">{rule.mode==="SHARE"?"老師比例／每人每堂":"元／整堂"}</span></>}</div>;
}
export function MusicTeacherFeeEditor({templates,qualificationIds,fees,settings,onSettings,onFees,onQualification,readOnly=false}:{readOnly?:boolean;templates:TeacherPlan[];qualificationIds:string[];fees:Record<string,TeacherFeeDraft>;settings:MusicTeacherSettings;onSettings:(s:MusicTeacherSettings)=>void;onFees:(f:Record<string,TeacherFeeDraft>)=>void;onQualification:(id:string,selected:boolean)=>void}) {
 const groups=new Map<string,TeacherPlan[]>();
 for(const t of templates){const key=t.musicSubjectId??"";groups.set(key,[...(groups.get(key)??[]),t]);}
 return <div className="space-y-3">
  <label className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-50 p-3"><strong className="text-sm">老師全科預設比例</strong><input disabled={readOnly} aria-label="老師全科預設比例" className={`${input} w-24`} type="number" min="0" max="1" step="0.0001" value={settings.defaultRatio??""} placeholder="沿用方案" onChange={e=>onSettings({...settings,defaultRatio:e.target.value===""?null:Number(e.target.value)})}/><span className="text-xs">例如 0.65；科目與方案可另設例外</span></label>
  <button disabled={readOnly} type="button" className={`${input} text-primary-800`} onClick={()=>{if(!window.confirm("將已選方案與科目例外全部改為沿用老師預設？既有課次不變。"))return;onSettings({...settings,subjectRules:{}});onFees(Object.fromEntries(Object.entries(fees).map(([id,draft])=>[id,qualificationIds.includes(id)?{...draft,mode:"INHERIT",value:"0"}:draft])));}}>全部沿用老師預設</button>
  {[...groups].map(([subjectId,plans])=><section key={subjectId} className="overflow-hidden rounded-lg border border-earth-200">
   <header className="space-y-2 bg-earth-50 px-3 py-2"><h4 className="font-medium">{plans[0].subjectName??"未分類科目"}</h4>{subjectId&&<RuleInput disabled={readOnly} label={`${plans[0].subjectName??"科目"}預設`} rule={settings.subjectRules[subjectId]??null} onChange={rule=>{const subjectRules={...settings.subjectRules};if(rule)subjectRules[subjectId]=rule;else delete subjectRules[subjectId];onSettings({...settings,subjectRules});}}/>}</header>
   <div className="divide-y divide-earth-100">{plans.map(plan=>{
    const selected=qualificationIds.includes(plan.id),draft=fees[plan.id];
    const override=draft&&draft.mode!=="INHERIT"?{mode:draft.mode,value:Number(draft.value)}:null;
    const effective=resolveMusicTeacherRule(override,plan.musicSubjectId,settings,plan.musicTeacherShare);
    return <div key={plan.id} className="space-y-1 px-3 py-2"><label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={e=>onQualification(plan.id,e.target.checked)}/>{plan.name}</label>{selected&&<><RuleInput disabled={readOnly} label={plan.name} rule={override} onChange={rule=>onFees({...fees,[plan.id]:{mode:rule?.mode as "CLASS"|"SHARE"??"INHERIT",value:String(rule?.value??0),revision:draft?.revision??0}})}/><p className="text-xs text-earth-600">{effective.source}{effective.rule?` · ${effective.rule.mode==="SHARE"?`${effective.rule.value/100}／每人每堂`:`NT$ ${effective.rule.value}／整堂`}`:""}</p></>}</div>;
   })}</div>
  </section>)}
 </div>;
}
