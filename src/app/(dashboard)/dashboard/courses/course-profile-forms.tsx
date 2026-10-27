"use client";
import {CourseChargePricingFields} from "./course-charge-pricing-fields";
import {coursePlanModeAllowed,courseSchedulingModes} from "@/lib/course-scheduling-modes";
import {courseChargeSettings} from "@/lib/course-charge-settings";
import {useCoursePersonnelText} from "@/components/course-personnel-label";
import { canCloseConfirmedSettingsSave } from "@/lib/settings-save-outcome";
import feeLayout from "./sports-fee-layout.module.css";
import { saveSportsFee } from "@/server/actions/sports-staging";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import { courseTemplateLabel } from "@/lib/course-template-presentation";
import { useEffect, useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import type {z} from "zod";
import type {SettingsSaveTransport} from "@/components/admin/use-settings-save";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { savedCoursePlan } from "@/lib/course-plan-save";
import { usePathname, useRouter } from "next/navigation";
import { BirthdayFields } from "@/components/birthday-fields";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { saveCourseCustomer } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
import { coursePlanSnapshot } from "@/lib/course-plan-snapshot";
import { musicPlanQuote } from "@/lib/music-course-products";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
import {savedCourseServicePrice,type CourseServicePrice} from '@/lib/course-service-price';
export type Person = { id: string; updatedAt?: string; name: string; phone: string; email: string | null; gender: string | null; birthday: string; serviceNote: string | null; address: string | null; notes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null };
export type Plan = {
  chargeSettings?:unknown;
  catalogRevision?:number;catalogSnapshot?:Record<string,unknown>;lowBalanceEnabled?:boolean;lowBalanceThreshold?:number|null;
  sportsMode?:string;sportsSubjectId?:string|null;sportsCost?:number|null;
  musicTerms?: number | null;
  musicBonusLessons?:number;musicTermSizes?:number[];
  id: string;
  name: string;
  points: number;
  price: number;
  storeCost?: number;
  termSessionIds?:string[];
  validDays: number;
  isActive: boolean;
  customerPurchasable?: boolean;
  allowShared?: boolean;
  unit: string;
  templateIds: string[];
};

const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
type Callbacks<T=Plan>={onPending:(value:boolean)=>void;onSaved:(row?:T,syncWarning?:boolean)=>void;onUncertain?:(value:boolean)=>void;onDirtyChange?:(value:boolean)=>void};
function useSaveForm<T=Plan>(draft: Pick<ReturnType<typeof useFormDraft>,"busy"|"mounted"|"stale"|"clear"|"dirty">, {onPending,onSaved,onDirtyChange}:Callbacks<T>){
 useEffect(()=>{onDirtyChange?.(draft.dirty);},[draft.dirty,onDirtyChange]);
 const router=useRouter();const [error,setError]=useState("");const [pending,setPending]=useState(false);
 const [committedWarning,setCommittedWarning]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>,save:(data:FormData)=>Promise<{success:boolean;error?:string;uncertain?:boolean;data?:unknown;confirmedPlan?:T;syncWarning?:boolean}>){
  event.preventDefault();if(draft.busy.current||draft.stale||committedWarning)return;
  const data=new FormData(event.currentTarget);draft.busy.current=true;setPending(true);onPending(true);setError("");
  try{const result=await save(data);if(!draft.mounted.current)return;
   if(!result.success){setError(result.error??"儲存失敗，輸入已保留");if(!result.uncertain)router.refresh();return;}
   if (!canCloseConfirmedSettingsSave(result, setError)) {setCommittedWarning(true);onSaved(result.confirmedPlan,true);return;}
   draft.clear();onSaved(result.confirmedPlan);
  }catch{if(draft.mounted.current)setError("連線中斷，輸入已保留，請稍後重試。");}
  finally{draft.busy.current=false;if(draft.mounted.current){setPending(false);onPending(false);}}
 }
 return {submit,error,pending,committedWarning};
}
export type CustomerProfileWriter=(input:Record<string,unknown>)=>Promise<{success:boolean;error?:string}>;
export function CourseCustomerDraftForm({save=saveCourseCustomer,draftScope="course-customer",person,canEdit,canCreate,hidden,compact=false,...callbacks}:Callbacks&{save?:CustomerProfileWriter;draftScope?:string;person:Person|null;canEdit:boolean;canCreate:boolean;hidden:boolean;compact?:boolean}){
 const [profileRequestKey]=useState(()=>crypto.randomUUID());
 const customerField=compact ? `${field} min-h-11 min-w-0 max-w-full` : field;
 const [year="1970",month="",day=""]=(person?.birthday??"").split("-");
 const draft=useFormDraft(`${draftScope}:${person?.id??"new"}`,{name:person?.name??"",phone:person?.phone??"",email:person?.email??"",gender:person?.gender??"",serviceNote:person?.serviceNote??"",address:person?.address??"",emergencyContactName:person?.emergencyContactName??"",emergencyContactPhone:person?.emergencyContactPhone??"",birthYear:year||"1970",birthMonth:month,birthDay:day},person?.updatedAt??null);
 const {submit,error,pending,committedWarning}=useSaveForm(draft,callbacks);
 return <form id="course-member-form" className={`${compact ? "grid grid-cols-2 gap-3 [&_label]:min-w-0" : "grid grid-cols-1 gap-3 sm:grid-cols-2"} ${hidden?"hidden":""}`} onSubmit={e=>{
  if(person?!canEdit:!canCreate){e.preventDefault();return;}
  void submit(e,d=>save({requestKey:profileRequestKey,id:person?.id,expectedUpdatedAt:draft.expectedRevision??undefined,name:d.get("name"),phone:d.get("phone"),email:d.get("email"),gender:d.get("gender"),birthday:d.get("birthday"),...(!person||compact?{serviceNote:d.get("serviceNote")}:{}),address:d.get("address"),emergencyContactName:d.get("emergencyContactName"),emergencyContactPhone:d.get("emergencyContactPhone")}));
 }}>
 <div className="col-span-full"><FormDraftNotice dirty={draft.dirty&&!committedWarning} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
 <fieldset disabled={pending||committedWarning} className="contents">
                <label className="block">
                  姓名
                  <input
                    className={customerField}
                    name="name"
                    value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}
                    readOnly={person ? !canEdit : !canCreate}
                    required
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  電話
                  <input
                    className={customerField}
                    name="phone"
                    value={draft.values.phone} onChange={e=>draft.set("phone",e.target.value)}
                    readOnly={person ? !canEdit : !canCreate}
                    maxLength={30}
                    required
                  />
                </label>
                <div className="col-span-full"><fieldset disabled={person ? !canEdit : !canCreate} className={compact ? "grid min-w-0 grid-cols-2 gap-3 [&>label]:min-w-0" : "grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2"}>
                  <label className="block">電子信箱<input className={customerField} name="email" type="email" value={draft.values.email} onChange={e=>draft.set("email",e.target.value)} /></label>
                  <label className="block">性別<select className={customerField} name="gender" value={draft.values.gender} onChange={e=>draft.set("gender",e.target.value)}><option value="">未填</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
                  <div className={compact ? "col-span-full min-w-0" : undefined}>生日<BirthdayFields parts={{year:draft.values.birthYear,month:draft.values.birthMonth,day:draft.values.birthDay}} onPartsChange={p=>draft.setMany({birthYear:p.year,birthMonth:p.month,birthDay:p.day})} className={customerField} /></div>
                  <label className="block">緊急聯絡人姓名（選填）<input className={customerField} name="emergencyContactName" maxLength={100} value={draft.values.emergencyContactName} onChange={e=>draft.set("emergencyContactName",e.target.value)} /></label>
                  <label className="block">緊急聯絡人電話（選填）<input className={customerField} name="emergencyContactPhone" type="tel" maxLength={30} value={draft.values.emergencyContactPhone} onChange={e=>draft.set("emergencyContactPhone",e.target.value)} /></label>
                  {(!person || compact) && <label className={compact ? "col-span-full block" : "block"}>{compact ? "學員備註" : "店內備註"}<textarea rows={2} className={customerField} name="serviceNote" value={draft.values.serviceNote} onChange={e=>draft.set("serviceNote",e.target.value)} maxLength={1000} /></label>}
                  <label className={compact ? "col-span-full block" : "block"}>地址<input className={customerField} name="address" maxLength={300} value={draft.values.address} onChange={e=>draft.set("address",e.target.value)} /></label>
                </fieldset></div>
              </fieldset></form>;
}
/** Service pricing uses the same draft, receipt, error and save lifecycle as the fee form. */
export function CourseServicePriceDraftForm({row,rows,transport,storeId,onSelect,...callbacks}:Callbacks<CourseServicePrice>&{row:CourseServicePrice;rows:CourseServicePrice[];transport:SettingsSaveTransport;storeId:string;onSelect:(id:string)=>void}){
 const draft=useFormDraft(`course-service-price:${row.id}`,{price:String(row.price),trialPrice:row.trialPrice===null?'':String(row.trialPrice),trialDuration:row.trialDuration===null?'':String(row.trialDuration)},String(row.revision));
 const mutation=useSettingsSave('',storeId,savedCourseServicePrice,transport);
 const {onUncertain}=callbacks;
 useEffect(()=>{onUncertain?.(mutation.uncertain);},[onUncertain,mutation.uncertain]);
 const {submit,error,pending,committedWarning}=useSaveForm<CourseServicePrice>(draft,callbacks);
 return <form id="course-member-form" className={feeLayout.form} onSubmit={e=>void submit(e,async()=>{
  const result=await mutation.save({id:row.id,revision:Number(draft.expectedRevision),price:Number(draft.values.price),trialPrice:draft.values.trialPrice.trim()===''?null:Number(draft.values.trialPrice),trialDuration:draft.values.trialDuration.trim()===''?null:Number(draft.values.trialDuration)});
  return result.success?{...result,confirmedPlan:result.data}:result;
 })}>
  <div><FormDraftNotice dirty={draft.dirty&&!committedWarning} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
  <fieldset className="contents" disabled={pending||mutation.uncertain||committedWarning}>
   <label>服務項目<select aria-label="服務定價項目" className={field} value={row.id} onChange={e=>onSelect(e.target.value)}>{rows.map(s=><option key={s.id} value={s.id}>{s.name} · 一般 {s.duration} 分鐘</option>)}</select></label>
   <label>一般價格（元）<input className={field} name="price" type="number" min="0" max="10000000" step="1" required value={draft.values.price} onChange={e=>draft.set('price',e.target.value)}/></label>
   <CourseTrialPriceFields price={draft.values.trialPrice} duration={draft.values.trialDuration} serviceDuration={row.duration} onChange={(key,value)=>draft.set(key,value)}/>
  </fieldset>
 </form>;
}
export function CourseTrialPriceFields({price,duration,serviceDuration,onChange}:{price:string;duration:string;serviceDuration:number;onChange:(key:'trialPrice'|'trialDuration',value:string)=>void}){
 return <><label>體驗價格（元，選填）<input className={field} name="trialPrice" type="number" min="0" max="10000000" step="1" value={price} onChange={e=>onChange('trialPrice',e.target.value)}/></label><label>體驗服務時長（分鐘，選填）<input className={field} name="trialDuration" type="number" min="5" max="720" step="1" placeholder={`沿用一般 ${serviceDuration} 分鐘`} value={duration} onChange={e=>onChange('trialDuration',e.target.value)}/></label><p className="text-sm text-earth-600">體驗時長留白沿用一般服務；整理時間沿用原設定。</p><p className="text-sm text-earth-600">體驗價留白表示不提供體驗；填 0 表示免費體驗。</p></>;
}
export type CourseChargeFields={trialStoreCost?:number|null;storeCost?:number|null;kind:'single'|'plan';locked:boolean;onKindChange:(kind:'single'|'plan')=>void;name:string;price:number|null;sessions:number|null;validDays:number;allowShared:boolean;serviceId:string;technicianIds:string[];trialPrice:number|null;trialDuration:number|null;technicians:{id:string;name:string;active:boolean;serviceIds:string[]}[]};
export type CoursePlanCatalogPort={charge?:CourseChargeFields;compact?:boolean;confirmDiscard?:boolean;servicePricing?:{rows:CourseServicePrice[];transport:SettingsSaveTransport};transport?:SettingsSaveTransport;rowSchema?:z.ZodType<Plan,z.ZodTypeDef,unknown>;values?:(input:Record<string,unknown>,plan:Plan|null)=>Record<string,unknown>;units?:readonly string[];sportsModes?:readonly string[];canEditCoaches?:boolean;sessionLabel?:string;save:(input:Record<string,unknown>,plan:Plan|null)=>Promise<{success:true;data:Plan}|{success:false;error:string}>};
export function CoursePlanDraftForm({catalog:source,subjectLabel="教學項目",sportsData,storeId,plan,templates,subjects=[],musicTeachers=[],canEditMusicTeachers=false,termSessions,profitEnabled,music=false,sharedCardState="ENABLED",initialTemplateId,...callbacks}:Callbacks&{musicTeachers?:{id:string;name:string;active:boolean;qualificationIds:string[]}[];canEditMusicTeachers?:boolean;catalog?:CoursePlanCatalogPort;subjectLabel?:string;sportsData?:SportsSnapshot;storeId:string;subjects?:{id:string;name:string;category:string;isActive:boolean}[];plan:Plan|null;templates:{id:string;name:string;durationMinutes?:number;displayName?:string;category:string;isActive:boolean;musicTeacherShare?:number|null;musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicTrialMode?:string|null;musicSubjectId?:string|null;classType?:string|null;musicScheduleMode?:string|null}[];termSessions:{id:string;name:string;startsAt:string}[];profitEnabled:boolean;music?:boolean;sharedCardState?:FeaturePresentationState;initialTemplateId?:string}){
  const personnelText = useCoursePersonnelText();
 const charge=source?.charge;
 const nativeCharge=(music||!!sportsData)&&!source;
 const compactNative=nativeCharge;
 const [feeSection,setFeeSection]=useState("pricing");
 const savedCharge=courseChargeSettings.safeParse(plan?.chargeSettings);
 const config=savedCharge.success?savedCharge.data:null;
 const preserveLegacyCharge=!!sportsData&&!!plan&&(plan.sportsMode??"LEGACY")==="LEGACY"&&plan.chargeSettings==null;
 const [sportsRequestKey]=useState(()=>crypto.randomUUID());
 const initialSportsFee=sportsData?.fees.find(f=>f.id===plan?.id);
 async function savePlanInput(input:Record<string,unknown>) {if(sportsData&&!plan&&(!sportsMode||!coursePlanModeAllowed(sportsData.schedulingModes,sportsMode)))return {success:false as const,error:"目前未開放新增收費方式，請先確認排課模式"};const nativeSettings=nativeCharge&&!preserveLegacyCharge?{kind:draft.values.chargeKind,durationMinutes:Number(draft.values.durationMinutes),trialPrice:draft.values.chargeKind==='single'&&sportsMode!=='OPEN'&&draft.values.nativeTrialPrice!==''?Number(draft.values.nativeTrialPrice):null,trialDuration:draft.values.chargeKind==='single'&&sportsMode!=='OPEN'&&draft.values.nativeTrialDuration!==''?Number(draft.values.nativeTrialDuration):null,providerIds:parseIds(draft.values.teacherIds),...(compactNative?{trialStoreCost:draft.values.chargeKind==='single'&&sportsMode!=='OPEN'&&draft.values.nativeTrialStoreCost!==''?Number(draft.values.nativeTrialStoreCost):null}:config?.trialStoreCost!==undefined?{trialStoreCost:config.trialStoreCost}:{})}:null;
 const pricedInput=nativeCharge?{...input,chargeSettings:nativeSettings}:input;
 const sourceValues={...pricedInput,sportsMode:sportsMode,subjectId:draft.values.subjectId,sportsCost:Number(draft.values.sportsCost),coachIds:parseIds(draft.values.sportsCoaches),chargeKind:charge?.kind,...(charge?{storeCost:draft.values.storeCost.trim()===""?null:Number(draft.values.storeCost),...(charge.kind==='single'?{trialStoreCost:draft.values.trialStoreCost.trim()===""?null:Number(draft.values.trialStoreCost)}:{})}:{}),trialPrice:draft.values.trialPrice?.trim()===''?null:Number(draft.values.trialPrice),trialDuration:draft.values.trialDuration?.trim()===''?null:Number(draft.values.trialDuration),templateIds:sportsMode==="OPEN"?[]:[draft.values.subjectId]};const result=source?.transport?await mutation.save(source.values?.(sourceValues,plan)??sourceValues):source?await source.save(sourceValues,plan):sportsData ? await saveSportsFee({chargeSettings:nativeSettings,id:plan?.id,sportsMode:sportsMode,subject:sportsMode==="OPEN"?undefined:draft.values.subjectId,name:input.name,unit:input.unit==="POINT"?"點數":"堂數",active:input.isActive,customerPurchasable:input.customerPurchasable,amount:input.points,price:input.price,storeCost:input.storeCost,days:input.validDays,cost:Number(draft.values.sportsCost),shared:input.allowShared,coachIds:parseIds(draft.values.sportsCoaches),expectedCompensation:initialSportsFee?.compensation??null,compensation:initialSportsFee?.compensation?{mode:draft.values.sportsCompensationMode,value:Number(draft.values.sportsCompensationValue)}:undefined,snapshot:initialSportsFee?.snapshot,requestKey:sportsRequestKey}) : await mutation.save(pricedInput);return result.success?{...result,confirmedPlan:result.data}:result;}
 const pathname=usePathname();
 const mutation=useSettingsSave<Plan>(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/plan`,storeId,source?.rowSchema??savedCoursePlan,source?.transport);
 const {onUncertain}=callbacks;
 useEffect(()=>{onUncertain?.(mutation.uncertain);},[onUncertain,mutation.uncertain]);
 const initialRule=templates.find(t=>t.id===(plan?.templateIds[0]??initialTemplateId));
 const paidLessons=plan ? plan.points-(plan.musicBonusLessons??0) : 0;
 const savedPeriod=plan?.musicTermSizes?.[0]??(plan&&paidLessons%(plan.musicTerms??1)===0?paidLessons/(plan.musicTerms??1):null);
 const subjectTeachers=(subjectId:string)=>musicTeachers.filter(t=>t.qualificationIds.some(id=>templates.some(v=>v.id===id&&v.musicSubjectId===subjectId))).map(t=>t.id);
 const initialSubject=charge?.serviceId??plan?.sportsSubjectId??initialRule?.musicSubjectId??(subjects.some(s=>s.id===initialTemplateId)?initialTemplateId:!plan&&subjects.filter(s=>s.isActive).length===1?subjects.find(s=>s.isActive)?.id:"");
 const draft=useFormDraft<Record<string,string>>(`${source?"beauty-fee":"course-plan"}:${plan?.id??`new:${initialTemplateId??"all"}`}`,{chargeKind:config?.kind??(plan?'plan':'single'),durationMinutes:String(config?.durationMinutes??initialRule?.durationMinutes??templates.find(t=>t.musicSubjectId===initialSubject)?.durationMinutes??60),nativeTrialPrice:config?.trialPrice==null?'':String(config.trialPrice),nativeTrialStoreCost:config?.trialStoreCost==null?'':String(config.trialStoreCost),nativeTrialDuration:config?.trialDuration==null?'':String(config.trialDuration),teacherIds:JSON.stringify(config?.providerIds??(music?subjectTeachers(initialSubject??''):sportsData?.coaches.filter(c=>c.templates.includes(initialSportsFee?.templateId??'')).map(c=>c.id)??[])),expectedTeacherIds:JSON.stringify(subjectTeachers(initialSubject??"")),sportsMode:plan?.sportsMode??(sportsData?(plan?"LEGACY":"ASSIGNED"):"LEGACY"),sportsCost:String(plan?.sportsCost??initialSportsFee?.cost??1),sportsCoaches:JSON.stringify(charge?.technicianIds??sportsData?.coaches.filter(c=>c.templates.includes(initialSportsFee?.templateId??"")).map(c=>c.id)??[]),sportsCompensationMode:initialSportsFee?.compensation?.mode??"SHARE",sportsCompensationValue:String(initialSportsFee?.compensation?.value??60),subjectId:initialSubject??"",classType:initialRule?.classType??"PRIVATE",musicTeacherShare:String(initialRule?.musicTeacherShare??0.6),musicPricePerLesson:String(plan&&paidLessons>0?plan.price/paidLessons:initialRule?.musicPricePerLesson??800),musicTermLessons:String(savedPeriod??initialRule?.musicTermLessons??4),musicValidityDaysPerTerm:String(plan?plan.validDays/(plan.musicTerms??1):initialRule?.musicValidityDaysPerTerm??35),musicScheduleMode:initialRule?.musicScheduleMode??"FIXED",trialPrice:charge?.trialPrice==null?"":String(charge.trialPrice),trialDuration:charge?.trialDuration==null?"":String(charge.trialDuration),name:charge?.name??plan?.name??"",kind:nativeCharge&&!plan?"SESSION":plan?.termSessionIds?.length?"TERM":plan?.unit??source?.units?.[0]??"POINT",scope:plan?.templateIds.length||initialTemplateId?"selected":"all",unit:music||nativeCharge&&!plan?"SESSION":plan?.unit??source?.units?.[0]??"POINT",active:plan?.isActive===false?"no":"yes",points:charge?String(charge.sessions??" ").trim():String(plan?.points??(nativeCharge?1:10)),price:charge?String(charge.price??" ").trim():String(plan?.price??0),trialStoreCost:String(charge?.trialStoreCost??""),storeCost:charge?String(charge.storeCost??""):String(plan?.storeCost??0),days:String(charge?.validDays??plan?.validDays??90),musicTerms:String(plan?.musicTerms??1),musicBonusLessons:String(plan?.musicBonusLessons??0),purchaseMode:plan?.customerPurchasable===false?"backend":"customer",allowShared:(charge?.allowShared??plan?.allowShared)?"yes":"no",templates:JSON.stringify(plan?.templateIds??(initialTemplateId?[initialTemplateId]:[])),terms:JSON.stringify(plan?.termSessionIds??[])},plan?JSON.stringify({...coursePlanSnapshot(plan),musicTerms:plan.musicTerms}):null);
 const itemRule=templates.find(t=>t.musicSubjectId===draft.values.subjectId);
 const {submit,error,pending,committedWarning}=useSaveForm(draft,callbacks);
 const [templateSearch,setTemplateSearch]=useState("");
 const closedPlanMode=!!sportsData&&!!plan&&!coursePlanModeAllowed(sportsData.schedulingModes,plan.sportsMode);
 const enabledModes=courseSchedulingModes(sportsData?.schedulingModes);
 const sportsMode=!plan&&sportsData&&!coursePlanModeAllowed(sportsData.schedulingModes,draft.values.sportsMode)?enabledModes.assigned?"ASSIGNED":enabledModes.open?"OPEN":"":draft.values.sportsMode;
 const planKind=draft.values.kind,courseScope=draft.values.scope;
 const [selectionError,setSelectionError]=useState("");
 const parseIds=(raw:string):string[]=>{try{const v:unknown=JSON.parse(raw);return Array.isArray(v)&&v.every(x=>typeof x==="string")?v:[];}catch{return [];}};
 const selectedTemplateIds=parseIds(draft.values.templates),selectedTerms=parseIds(draft.values.terms);
 const setSelectedTemplateIds:Dispatch<SetStateAction<string[]>>=next=>draft.set("templates",JSON.stringify(typeof next==="function"?next(selectedTemplateIds):next));
 const visibleTemplates=templates.filter(t=>t.name.toLocaleLowerCase().includes(templateSearch.trim().toLocaleLowerCase()));
 const templateGroup=(t:typeof templates[number])=>music ? t.category||"未分類" : t.classType==="GROUP"?"團體課":t.classType==="PRIVATE"?"個別課":t.classType==="SELF_ORGANIZED"?"自組課":"未設定班別";
 const templateGroups=[...new Set(visibleTemplates.map(templateGroup))];
 const musicQuote=music&&draft.values.subjectId?(()=>{try{return musicPlanQuote({musicPricePerLesson:Number(draft.values.musicPricePerLesson),musicTermLessons:Number(draft.values.musicTermLessons),musicValidityDaysPerTerm:Number(draft.values.musicValidityDaysPerTerm)},1);}catch{return null;}})():null;
 const preservePeriods=!!plan&&Number(draft.values.points)===plan.points;
 const feeTerms=preservePeriods?plan.musicTerms??1:1;
 const feeBonus=preservePeriods?plan.musicBonusLessons??0:0;
 const feeLessons=(Number(draft.values.points)-feeBonus)/feeTerms;
 const unitPrice=music?Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)-feeBonus)):Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)));
 const estimatedProfit=Number(draft.values.price)-Number(draft.values.storeCost);
 const nativeSingle=nativeCharge&&draft.values.chargeKind==='single';
 const nativeProviders=music?musicTeachers.filter(t=>t.active&&t.qualificationIds.some(id=>templates.some(v=>v.id===id&&v.musicSubjectId===draft.values.subjectId))).map(t=>({id:t.id,name:t.name})):sportsData?.coaches.filter(c=>sportsMode==='OPEN'||c.templates.includes(sportsData.subjects.find(s=>s.id===draft.values.subjectId)?.templateId??'')).map(c=>({id:c.id,name:c.name}))??[];
 const retiredProviderIds=parseIds(draft.values.teacherIds).filter(id=>!nativeProviders.some(p=>p.id===id));
 const providerFields=<fieldset className={feeLayout.providers}><legend>{music?"此收費可安排的教師（至少一位）":personnelText("此收費可安排的教練（至少一位）")}</legend><div className={feeLayout.providerList}>{nativeProviders.map(t=><label key={t.id}><input type="checkbox" checked={parseIds(draft.values.teacherIds).includes(t.id)} onChange={e=>draft.set('teacherIds',JSON.stringify(e.target.checked?[...parseIds(draft.values.teacherIds),t.id]:parseIds(draft.values.teacherIds).filter(id=>id!==t.id)))}/>{t.name}</label>)}{retiredProviderIds.map(id=><label key={id}><input type="checkbox" checked onChange={()=>draft.set('teacherIds',JSON.stringify(parseIds(draft.values.teacherIds).filter(value=>value!==id)))}/>{musicTeachers.find(t=>t.id===id)?.name??sportsData?.coaches.find(t=>t.id===id)?.name??'已移除人員'}（請移除）</label>)}</div><p className="text-sm text-earth-600">只限這筆收費，不變更授課資格。</p></fieldset>;
 const hasTrialSection=compactNative&&nativeSingle&&sportsMode!=="OPEN";
 const visibleFeeSection=feeSection==="trial"&&!hasTrialSection?"pricing":feeSection;
 const trialProfit=draft.values.nativeTrialPrice!==""&&draft.values.nativeTrialStoreCost!==""?Number(draft.values.nativeTrialPrice)-Number(draft.values.nativeTrialStoreCost):null;
 const compactChargeFields=<>
  <nav className={feeLayout.feeTabs} data-has-trial={hasTrialSection} aria-label="收費方式分區">{[["pricing","收費設定"],...(hasTrialSection?[["trial","體驗設定"]]:[]),["teaching","授課設定"]].map(([id,label])=><button type="button" key={id} aria-pressed={visibleFeeSection===id} onClick={()=>setFeeSection(id)}>{label}</button>)}</nav>
  <div className={feeLayout.panes} data-has-trial={hasTrialSection}>
   <section className={feeLayout.pane} data-fee-section="pricing" data-active={visibleFeeSection==="pricing"} aria-label="收費設定">
    <h3>一般收費</h3>
    <label>名稱 *<input className={field} name="name" required value={draft.values.name} onChange={e=>draft.set('name',e.target.value)}/></label>
    <label>狀態<select className={field} name="active" value={draft.values.active} onChange={e=>draft.set('active',e.target.value)}><option value="yes">上架</option><option value="no">下架</option></select></label>
    <label>收費類型<select aria-label="收費類型" className={field} disabled={preserveLegacyCharge} value={draft.values.chargeKind} onChange={e=>draft.setMany({chargeKind:e.target.value,...(e.target.value==='single'?{points:'1',kind:'SESSION',unit:'SESSION',allowShared:'no'}:{})})}><option value="single">單次收費</option><option value="plan">多次方案</option></select></label>
    {!nativeSingle&&<>{!music&&<label>計費方式<select className={field} value={draft.values.unit} onChange={e=>draft.setMany({kind:e.target.value,unit:e.target.value})}><option value="SESSION">堂數</option><option value="POINT">點數</option></select></label>}<label>{music?(preservePeriods&&feeTerms>1?"總堂數（保留期別）":"每期堂數"):draft.values.unit==='POINT'?'總點數':'總堂數'} *<input className={field} name="points" type="number" min={1} required value={draft.values.points} onChange={e=>draft.set('points',e.target.value)}/></label></>}
    <input type="hidden" name="unit" value={nativeSingle?'SESSION':draft.values.unit}/>{nativeSingle&&<input type="hidden" name="points" value="1"/>}
    <label>{music?"有效天數":"有效期（天）"} *<input className={field} name="days" type="number" min={1} required value={draft.values.days} onChange={e=>draft.set('days',e.target.value)}/></label>
    <label>{music&&!nativeSingle?"每期金額":"售價"} *<input className={field} name="price" type="number" min={0} required value={draft.values.price} onChange={e=>draft.set('price',e.target.value)}/></label>
    {profitEnabled&&<label>店家成本<input className={field} name="storeCost" type="number" min={0} required value={draft.values.storeCost} onChange={e=>draft.set('storeCost',e.target.value)}/></label>}
    {hasTrialSection&&<label>一般時間（分鐘）<input aria-label="一般上課時間" className={field} type="number" required min={5} max={480} value={draft.values.durationMinutes} onChange={e=>draft.set('durationMinutes',e.target.value)}/></label>}
    <div className={feeLayout.summary}><p>單位價格 <strong>NT$ {unitPrice.toLocaleString('zh-TW')}／{draft.values.unit==='POINT'?'點':'堂'}</strong></p>{profitEnabled&&<p>{music?"預估利潤（未扣教師費）":"預估利潤"} <strong className={estimatedProfit<0?'text-red-700':''}>NT$ {estimatedProfit.toLocaleString('zh-TW')}</strong></p>}</div>
    <p className={feeLayout.full+' text-sm text-earth-500'}>{music?(nativeSingle?"單次收費，每次使用一堂。":"購買時選擇期數，堂數、金額與效期依期數計算。")+"修改僅影響新購買。":"修改僅影響新購買；下架保留既有額度。"}</p>
   </section>
   {hasTrialSection&&<section className={feeLayout.pane} data-fee-section="trial" data-active={visibleFeeSection==="trial"} aria-label="體驗收費">
    <h3>體驗收費</h3>
    <label>體驗價（元）<input aria-label="體驗價" className={field} type="number" min={0} max={1000000} required={draft.values.nativeTrialStoreCost!==''} value={draft.values.nativeTrialPrice} onChange={e=>draft.set('nativeTrialPrice',e.target.value)}/></label>
    {profitEnabled&&<label>體驗店家成本<input aria-label="體驗店家成本" className={field} type="number" min={0} max={10000000} value={draft.values.nativeTrialStoreCost} onChange={e=>draft.set('nativeTrialStoreCost',e.target.value)}/></label>}
    <label>體驗時間（分鐘）<input aria-label="體驗時間" className={field} type="number" min={5} max={480} placeholder={`沿用 ${draft.values.durationMinutes} 分鐘`} value={draft.values.nativeTrialDuration} onChange={e=>draft.set('nativeTrialDuration',e.target.value)}/></label>
    {profitEnabled&&<p className={feeLayout.summary}>{music?"體驗預估利潤（未扣教師費）":"體驗預估利潤"} <strong className={trialProfit!==null&&trialProfit<0?'text-red-700':''}>{trialProfit===null?'—':`NT$ ${trialProfit.toLocaleString('zh-TW')}`}</strong></p>}
    <p className={feeLayout.full+' text-sm text-earth-600'}>體驗價留白不提供，0 為免費；時間留白沿用一般時間。{profitEnabled&&'體驗成本留白為未設定，不沿用一般成本。'}</p>
   </section>}
   <section className={feeLayout.pane} data-fee-section="teaching" data-active={visibleFeeSection==="teaching"} aria-label="授課設定">
    <h3>授課設定</h3>
    {!music&&(enabledModes.open&&enabledModes.assigned||!!plan&&sportsMode==='LEGACY')&&<label className={feeLayout.full}>方案適用方式<select aria-label="方案適用方式" className={field} disabled={!!plan&&sportsMode==='LEGACY'} value={sportsMode} onChange={e=>draft.set('sportsMode',e.target.value)}>{plan&&(plan.sportsMode??'LEGACY')==='LEGACY'&&<option value="LEGACY">既有方案（保留原規則）</option>}{enabledModes.assigned&&<option value="ASSIGNED">指定項目方案</option>}{enabledModes.open&&<option value="OPEN">開放選課通用卡</option>}</select></label>}
    {closedPlanMode&&<p role="status" className={feeLayout.full}>此方案的排課模式已關閉；既有紀錄保留，目前不提供新增購買或指派。</p>}
    {sportsMode!=='OPEN'&&<label className={feeLayout.full}>{subjectLabel}<select aria-label={subjectLabel} className={field} required disabled={!music&&!!plan&&sportsMode==='LEGACY'} value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,teacherIds:'[]',...(music?{expectedTeacherIds:JSON.stringify(subjectTeachers(e.target.value))}:{})})}><option value="">請選擇{subjectLabel}</option>{subjects.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {!music&&sportsMode!=='OPEN'&&!nativeSingle&&draft.values.unit==='POINT'&&<label>每堂使用點數<input className={field} aria-label="每堂使用額度" type="number" min={1} required value={draft.values.sportsCost} onChange={e=>draft.set('sportsCost',e.target.value)}/></label>}
    {preserveLegacyCharge?<p className={feeLayout.full+" text-sm text-earth-600"}>保留既有授課規則；修改購買方式不需重新設定授課人員。</p>:providerFields}

    {enabledModes.open&&sportsMode==='OPEN'&&<p className={feeLayout.full+' text-sm text-earth-600'}>開放選課沿用店家預設體驗費，時間依所選課程。</p>}
    {music?<><label>拆帳比例（老師 %）<input aria-label="教師拆帳比例" className={field} type="number" required min={0} max={100} step={1} value={Math.round(Number(draft.values.musicTeacherShare)*100)} onChange={e=>draft.set('musicTeacherShare',String(Number(e.target.value)/100))}/></label><p className={feeLayout.full+' text-sm text-earth-600'}>教師拆帳依原計酬規則計算；購課時選擇期數。</p></>:<fieldset className={feeLayout.full}><legend className="text-sm">{sharedCardState==='HIDDEN'?'購買方式':'購買方式與共卡'}</legend><div className="flex flex-wrap gap-x-3"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="customer" checked={draft.values.purchaseMode==='customer'} onChange={()=>draft.set('purchaseMode','customer')}/>顧客可購買</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="backend" checked={draft.values.purchaseMode==='backend'} onChange={()=>draft.set('purchaseMode','backend')}/>僅後台指派</label>{sharedCardState!=='HIDDEN'&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="allowShared" value="yes" disabled={sharedCardState!=='ENABLED'} checked={sharedCardState!=='ENABLED'?!!plan?.allowShared:draft.values.allowShared==='yes'} onChange={e=>draft.set('allowShared',e.target.checked?'yes':'no')}/>允許共卡</label>}</div></fieldset>}
   </section>
  </div>
 </>;
 if(music) return <form onInvalidCapture={e=>{const target=e.target as HTMLElement;const pane=target.closest<HTMLElement>("[data-fee-section]");if(pane){setFeeSection(pane.dataset.feeSection!);requestAnimationFrame(()=>target.focus({preventScroll:true}));}const section=(e.target as HTMLElement).closest("details");if(section)section.open=true;}} id="course-member-form" className={nativeCharge?feeLayout.compactForm:"@container/fee grid grid-cols-1 gap-3 sm:grid-cols-2"} onSubmit={e=>{if(!parseIds(draft.values.teacherIds).length){e.preventDefault();setSelectionError(personnelText("請至少選擇一位可授課教師"));setFeeSection("teaching");return;}setSelectionError("");void submit(e,()=>savePlanInput({
   id:plan?.id,expectedSnapshot:draft.expectedRevision??undefined,
   musicTeacherIds:parseIds(draft.values.teacherIds),expectedMusicTeacherIds:parseIds(draft.values.expectedTeacherIds),
   name:draft.values.name,points:Number(draft.values.points),price:Number(draft.values.price),
   storeCost:profitEnabled?Number(draft.values.storeCost):plan?.storeCost??0,validDays:Number(draft.values.days),
   musicTerms:feeTerms,musicBonusLessons:feeBonus,termSessionIds:[],templateIds:[],unit:"SESSION",
   customerPurchasable:plan?.customerPurchasable??true,allowShared:plan?.allowShared??false,isActive:draft.values.active==="yes",
   musicSetup:{subjectId:draft.values.subjectId,classType:itemRule?.classType??null,
     musicTeacherShare:Number(draft.values.musicTeacherShare),totalPrice:Number(draft.values.price),
     musicPricePerLesson:Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)-feeBonus)),
     musicTermLessons:feeLessons,musicValidityDaysPerTerm:Number(draft.values.days)/feeTerms,
     musicScheduleMode:itemRule?.musicScheduleMode??"FIXED"}
 }));}}>
   <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty&&!committedWarning&&(!nativeCharge||draft.stale)} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
   {selectionError&&<p role="alert" className="sm:col-span-2 text-red-700">{selectionError}</p>}
   <fieldset disabled={pending||mutation.uncertain||committedWarning} className="contents">{nativeCharge?compactChargeFields:<>
     <label>教學項目<select className={field} required value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,teacherIds:JSON.stringify(nativeCharge?[]:subjectTeachers(e.target.value)),expectedTeacherIds:JSON.stringify(subjectTeachers(e.target.value))})}><option value="">請先選擇教學項目</option>{subjects.filter(s=>s.isActive||s.id===draft.values.subjectId).map(s=><option key={s.id} value={s.id}>{s.name}{s.isActive?"":"（下架）"}</option>)}</select></label>
     <label >收費名稱<input className={field} required maxLength={80} value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}/></label>
                {!nativeCharge&&<fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3"><legend className="px-1 font-medium">{personnelText("可授課教師")}</legend><p className="mb-2 text-sm text-earth-600">{personnelText("與教師管理的可教授教學項目同步；同一項目下所有收費方式共用。")}</p><div className="grid grid-cols-2 gap-x-3">{musicTeachers.filter(t=>t.active).map(t=><label key={t.id} className="flex min-h-11 min-w-0 items-center gap-2 break-words [&>input]:shrink-0"><input type="checkbox" disabled={!canEditMusicTeachers||!draft.values.subjectId||!t.active} checked={parseIds(draft.values.teacherIds).includes(t.id)} onChange={e=>draft.set("teacherIds",JSON.stringify(e.target.checked?[...parseIds(draft.values.teacherIds),t.id]:parseIds(draft.values.teacherIds).filter(id=>id!==t.id)))}/>{t.name}{!t.active&&"（已停用）"}</label>)}</div>{musicTeachers.some(t=>!t.active&&parseIds(draft.values.teacherIds).includes(t.id))&&<details><summary className="min-h-11 cursor-pointer py-2 text-sm text-earth-600">{personnelText("已關聯停用教師（")}{musicTeachers.filter(t=>!t.active&&parseIds(draft.values.teacherIds).includes(t.id)).length}）</summary><ul className="grid gap-2 sm:grid-cols-2">{musicTeachers.filter(t=>!t.active&&parseIds(draft.values.teacherIds).includes(t.id)).map(t=><li key={t.id} className="text-sm text-earth-500">{t.name}（已停用，保留關聯）</li>)}</ul></details>}{!musicTeachers.length&&<p>{personnelText("尚無教師，請先至教師管理建立。")}</p>}{!canEditMusicTeachers&&<p className="text-sm text-earth-600">{personnelText("修改授課教師需要人員管理權限。")}</p>}</fieldset>}

     <div className="sm:col-span-2 grid grid-cols-2 gap-2 @min-[28rem]/fee:grid-cols-3"><label className="col-span-2 @min-[28rem]/fee:col-span-1">收費金額<input className={field} required type="number" min={0} max={10000000} step={1} value={draft.values.price} onChange={e=>draft.set("price",e.target.value)}/></label>
     <label hidden={nativeSingle}>{preservePeriods&&feeTerms>1?"總堂數（保留既有期別）":"每期堂數"}<input className={field} required type="number" min={1} max={1000} step={1} value={draft.values.points} onChange={e=>draft.set("points",e.target.value)}/></label>
     <label>有效天數<input aria-label="收費有效天數" className={field} required type="number" min={1} max={3650} value={draft.values.days} onChange={e=>draft.set("days",e.target.value)}/></label></div>
     <p className="sm:col-span-2 self-center text-earth-600">{nativeSingle?"單次收費，每次使用一堂。":"購買時選擇幾期，堂數、金額與效期依期數計算。"}</p>
     <details className="sm:col-span-2"><summary className="min-h-11 cursor-pointer py-2">{personnelText("拆帳設定 · 老師 ")}{Math.round(Number(draft.values.musicTeacherShare)*100)}%</summary><label>{personnelText("拆帳比例（老師 %）")}<input className={field} required type="number" min={0} max={100} step={1} value={Math.round(Number(draft.values.musicTeacherShare)*100)} onChange={e=>draft.set("musicTeacherShare",String(Number(e.target.value)/100))}/></label></details>
   </>}</fieldset>
 </form>;
 return <form id="course-member-form" className={compactNative?feeLayout.compactForm:sportsData?feeLayout.form:"grid grid-cols-1 gap-3 sm:grid-cols-2"} onInvalidCapture={e=>{const target=e.target as HTMLElement;const pane=target.closest<HTMLElement>("[data-fee-section]");if(pane){setFeeSection(pane.dataset.feeSection!);requestAnimationFrame(()=>target.focus({preventScroll:true}));}const section=target.closest("details");if(section)section.open=true;if(!compactNative)target.scrollIntoView?.({block:"nearest"});}} onSubmit={e=>{if(nativeCharge&&!preserveLegacyCharge&&!parseIds(draft.values.teacherIds).length){e.preventDefault();setSelectionError('請至少勾選一位可安排的授課人員');if(compactNative)setFeeSection('teaching');return;}if(!music&&!sportsData&&((courseScope==="selected"&&!selectedTemplateIds.length)||(planKind==="TERM"&&selectedTerms.length!==Number(draft.values.points)))){e.preventDefault();const section=e.currentTarget.querySelector<HTMLDetailsElement>(courseScope==="selected"&&!selectedTemplateIds.length?'[data-plan-section="courses"]':'[data-plan-section="dates"]');if(section){section.open=true;section.scrollIntoView?.({block:"nearest"});}setSelectionError(courseScope==="selected"&&!selectedTemplateIds.length?"請選至少一門適用課程，或改為全部課程。":"上課日期數須與整期堂數一致。");return;}setSelectionError("");void submit(e,d=>savePlanInput({id:plan?.id,...(music?{musicSetup:{musicTeacherShare:Number(draft.values.musicTeacherShare),subjectId:draft.values.subjectId,classType:draft.values.classType,musicPricePerLesson:Number(draft.values.musicPricePerLesson),musicTermLessons:Number(draft.values.musicTermLessons),musicValidityDaysPerTerm:Number(draft.values.musicValidityDaysPerTerm),musicScheduleMode:draft.values.musicScheduleMode}}:{}),expectedSnapshot:draft.expectedRevision??undefined,name:d.get("name"),points:music?musicQuote?.lessons??0:Number(d.get("points")),price:music?musicQuote?.price??0:Number(d.get("price")),storeCost:music?0:profitEnabled?Number(d.get("storeCost")):(plan?.storeCost??0),termSessionIds:music||planKind==="TERM"?d.getAll("termSessionIds"):[],customerPurchasable:draft.values.purchaseMode==="customer",allowShared:!music&&sharedCardState!=="ENABLED"?!!plan?.allowShared:!music&&planKind==="TERM"?false:d.get("allowShared")==="yes",validDays:music?musicQuote?.validDays??0:Number(d.get("days")),musicTerms:music?1:null,musicBonusLessons:0,isActive:d.get("active")==="yes",unit:music?"SESSION":d.get("unit"),templateIds:music||courseScope==="selected"?d.getAll("templateIds"):[]}));}}>
 <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty&&!committedWarning&&(!sportsData||draft.stale)} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
 {selectionError&&<p role="alert" className="sm:col-span-2 text-sm text-red-700">{selectionError}</p>}
 <fieldset disabled={pending || mutation.uncertain || committedWarning} className="contents">{compactNative?compactChargeFields:<>
                <label className={music ? "block" : "block sm:col-span-2"}>
                  {music ? "班型名稱（必填）" : "名稱 *"}
                  <input
                    className={field}
                    name="name"
                    value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}
                    required
                  />
                </label>
                {charge?<><label>收費類型<select aria-label="收費類型" className={field} disabled={charge.locked} value={charge.kind} onChange={e=>charge.onKindChange(e.target.value as 'single'|'plan')}><option value="single">單次收費</option><option value="plan">多次方案</option></select></label><input type="hidden" name="unit" value="SESSION"/></>:music?<input type="hidden" name="unit" value="SESSION"/>:<label hidden={nativeSingle} className="block">計費方式<select className={field} value={planKind} onChange={e=>{draft.setMany({kind:e.target.value,unit:e.target.value==="TERM"?"SESSION":e.target.value});}}><option value="POINT" disabled={!!source?.units&&!source.units.includes("POINT")}>點數</option><option value="SESSION" disabled={!!source?.units&&!source.units.includes("SESSION")}>{source?.sessionLabel??"堂數"}</option>{!sportsData&&<option value="TERM">期課</option>}</select><input type="hidden" name="unit" value={planKind==="TERM"?"SESSION":draft.values.unit}/></label>}
                <label hidden={!!charge} className="block">狀態<select className={field} name="active" value={draft.values.active} onChange={e=>draft.set("active",e.target.value)}><option value="yes">上架</option><option value="no">下架</option></select></label>
                {sportsData&&!charge&&(enabledModes.open&&enabledModes.assigned||!!plan&&sportsMode==="LEGACY")&&<label className="sm:col-span-2">方案適用方式<select aria-label="方案適用方式" className={field} disabled={!!plan&&sportsMode==="LEGACY"} value={sportsMode} onChange={e=>draft.set("sportsMode",e.target.value)}>{plan&&(plan.sportsMode??"LEGACY")==="LEGACY"&&<option value="LEGACY">既有方案（保留原規則）</option>}{enabledModes.assigned&&<option value="ASSIGNED">指定項目方案</option>}{enabledModes.open&&<option value="OPEN" disabled={!!source?.sportsModes&&!source.sportsModes.includes("OPEN")}>開放選課通用卡</option>}</select></label>}
                {closedPlanMode&&<p role="status" className="sm:col-span-2 text-earth-600">此方案的排課模式已關閉；既有紀錄保留，目前不提供新增購買或指派。</p>}
                {sportsData&&enabledModes.open&&sportsMode==="OPEN"&&<p className="sm:col-span-2 text-sm text-earth-600">適用本店開放選課；每堂依教學項目規則扣抵。</p>}
                {sportsData&&sportsMode!=="OPEN"&&<><label>{subjectLabel}<select aria-label={subjectLabel} className={field} disabled={charge?.locked||!!plan&&nativeCharge&&sportsMode==="LEGACY"} required value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,...(charge?{sportsCoaches:"[]"}:nativeCharge?{teacherIds:"[]"}:{})})}><option value="">請選擇{subjectLabel}</option>{subjects.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{!charge&&!nativeSingle&&<label>每堂使用{draft.values.unit==="POINT"?"點數":"堂數"}<input aria-label="每堂使用額度" className={field} type="number" min="1" required disabled={draft.values.unit!=="POINT"} value={draft.values.unit==="POINT"?draft.values.sportsCost:"1"} onChange={e=>draft.set("sportsCost",e.target.value)}/></label>}{sportsMode==="LEGACY"&&!nativeCharge&&<>{initialSportsFee?.compensation&&<><label>教練計酬方式<select aria-label={personnelText("教練計酬方式")} className={field} value={draft.values.sportsCompensationMode} onChange={e=>draft.set("sportsCompensationMode",e.target.value)}><option value="SHARE">拆帳</option><option value="HOUR">固定鐘點</option></select></label><label>{draft.values.sportsCompensationMode==="HOUR"?"鐘點費（元／小時）":personnelText("教練拆帳比例（%）")}<input aria-label="計酬數值" className={field} type="number" min="0" max={draft.values.sportsCompensationMode==="SHARE"?100:1000000} step="0.01" required value={draft.values.sportsCompensationValue} onChange={e=>draft.set("sportsCompensationValue",e.target.value)}/></label></>}{!nativeCharge&&<fieldset disabled={source?.canEditCoaches===false} data-fee-coaches className="sm:col-span-2"><legend>可授課教練（至少一位）</legend><div className="flex flex-wrap gap-3">{sportsData.coaches.map(c=><label key={c.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={parseIds(draft.values.sportsCoaches).includes(c.id)} onChange={e=>draft.set("sportsCoaches",JSON.stringify(e.target.checked?[...parseIds(draft.values.sportsCoaches),c.id]:parseIds(draft.values.sportsCoaches).filter(id=>id!==c.id)))}/>{c.name}</label>)}</div></fieldset>}</>}</>}


                           {charge&&<CourseChargePricingFields kind={charge.kind} price={draft.values.price} trialPrice={draft.values.trialPrice} storeCost={draft.values.storeCost} trialStoreCost={draft.values.trialStoreCost} sessions={draft.values.points} onChange={(key,value)=>draft.set(key,value)}/>}
                {charge&&<fieldset data-fee-coaches className="sm:col-span-2"><legend>可安排技師（至少一位）</legend><div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">{[...charge.technicians.filter(t=>t.active&&t.serviceIds.includes(draft.values.subjectId)),...parseIds(draft.values.sportsCoaches).filter(id=>!charge.technicians.some(t=>t.id===id&&t.active&&t.serviceIds.includes(draft.values.subjectId))).map(id=>({id,name:(charge.technicians.find(t=>t.id===id)?.name??'已移除技師')+'（請移除）'}))].map(t=><label key={t.id} className="flex min-h-11 min-w-0 items-center gap-2 break-words"><input type="checkbox" checked={parseIds(draft.values.sportsCoaches).includes(t.id)} onChange={e=>draft.set("sportsCoaches",JSON.stringify(e.target.checked?[...parseIds(draft.values.sportsCoaches),t.id]:parseIds(draft.values.sportsCoaches).filter(id=>id!==t.id)))}/>{t.name}</label>)}</div><p className="text-sm text-earth-600">實際安排仍依服務資格、排班與位置空位判斷。</p></fieldset>}
                {charge?.kind==='single'&&<><input type="hidden" name="points" value="1"/><input type="hidden" name="days" value="90"/><label className="sm:col-span-2">體驗服務時長（分鐘，選填）<input className={field} name="trialDuration" type="number" min="5" max="720" step="1" placeholder={`沿用一般 ${templates.find(t=>t.id===draft.values.subjectId)?.durationMinutes??60} 分鐘`} value={draft.values.trialDuration} onChange={e=>draft.set('trialDuration',e.target.value)}/><span className="text-sm text-earth-600">留白沿用一般服務時長；整理時間沿用原設定。</span></label></>}
                {nativeSingle&&<input type="hidden" name="points" value="1"/>}
                {!music&&<>
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">{[
                  ["額度", "points", plan?.points ?? 10, 1],
                  ["售價", "price", plan?.price ?? 0, 0],
                  ["店家成本", "storeCost", plan?.storeCost ?? 0, 0],
                  ["有效期（天）", "days", plan?.validDays ?? 90, 1],
                ].filter(([,name])=>(!charge||name!=="price")&&name!=="storeCost"&&(!nativeSingle||name!=="points")&&(charge?.kind!=="single"||name==="price")).map(([label, name, , min]) => (
                  <label key={String(name)} className="block">
                    {name==="points"?(planKind==="POINT"?"總點數":planKind==="TERM"?"整期堂數":source?.sessionLabel==="次數"?"總次數":"總堂數"):label} *
                    <input
                      className={field}
                      name={String(name)}
                      type="number"
                      min={charge&&name==="points"?2:Number(min)}
                      value={draft.values[String(name)]}
                      onChange={e=>draft.set(String(name),e.target.value)}
                      required
                    />
                  </label>
                ))}</div>
                <div hidden={!!charge} className="sm:col-span-2 flex flex-wrap gap-x-5 gap-y-1 py-1 text-sm"><p><span className="text-earth-500">單位價格</span><strong className="ml-2 text-primary-800">NT$ {unitPrice.toLocaleString("zh-TW")}／{draft.values.unit==="POINT"?"點":source?.sessionLabel==="次數"?"次":"堂"}</strong></p></div>
                <fieldset hidden={charge?.kind==='single'} className="sm:col-span-2"><legend className="mb-1 text-sm">{sharedCardState==="HIDDEN"?"購買方式":"購買方式與共卡"}</legend><div className="flex flex-wrap gap-x-5 gap-y-1"><label hidden={!!charge} className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="customer" checked={draft.values.purchaseMode==="customer"} onChange={()=>draft.set("purchaseMode","customer")}/>顧客可購買</label><label hidden={!!charge} className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="backend" checked={draft.values.purchaseMode==="backend"} onChange={()=>draft.set("purchaseMode","backend")}/>僅後台指派</label>{sharedCardState!=="HIDDEN"&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="allowShared" value="yes" disabled={planKind==="TERM"||sharedCardState!=="ENABLED"} checked={sharedCardState!=="ENABLED"?!!plan?.allowShared:planKind!=="TERM"&&draft.values.allowShared==="yes"} onChange={e=>draft.set("allowShared",e.target.checked?"yes":"no")}/>允許共卡{sharedCardState==="LOCKED"&&<span className="text-earth-500">（功能未開通）</span>}</label>}</div></fieldset>
                <details hidden={!!sportsData} data-plan-section="courses" name="fitness-plan-sections" className="sm:col-span-2"><summary className="flex min-h-11 cursor-pointer items-center justify-between border-t border-earth-100 text-sm"><span>適用課程</span><span className="text-earth-500">{courseScope==="all"?"全部課程":`已選 ${selectedTemplateIds.length} 門`} <span className="ml-2 text-primary-700">修改</span></span></summary><label className="block text-sm">範圍<select className={field} value={courseScope} onChange={e=>draft.set("scope",e.target.value)}><option value="all">全部課程</option><option value="selected">指定課程</option></select></label><div hidden={courseScope!=="selected"}><label className="block">搜尋課程<input className={field} value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="搜尋課程名稱"/></label>
                <fieldset className="sm:col-span-2 pt-2">

                  {selectedTemplateIds.map(id=><input key={id} type="hidden" name="templateIds" value={id}/>)}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-earth-100 pb-2 text-sm">
                    <span className="text-earth-600">已選 {selectedTemplateIds.length} 門</span>
                    <span className="flex gap-2">
                      <button type="button" className={button} onClick={()=>{setSelectedTemplateIds(ids=>[...new Set([...ids,...visibleTemplates.filter(t=>t.isActive).map(t=>t.id)])]);}}>全選目前結果</button>
                      <button type="button" className={button} onClick={()=>{setSelectedTemplateIds(ids=>ids.filter(id=>!visibleTemplates.some(t=>t.id===id&&t.isActive)));}}>清除目前結果</button>
                    </span>
                  </div>
                  <div className="max-h-64 space-y-3 overflow-y-auto overscroll-contain pr-1">
                    {templateGroups.map(group=><section key={group} aria-label={group}>
                      <h3 className="sticky top-0 bg-white py-1 text-xs font-semibold text-earth-500">{group}</h3>
                      {visibleTemplates.filter(t=>templateGroup(t)===group).map(t=>{
                        const selected=selectedTemplateIds.includes(t.id);
                        return <label key={t.id} className={`flex min-h-10 items-center gap-2 rounded-md px-2 ${t.isActive?"hover:bg-earth-50":"bg-earth-50 text-earth-400"}`}>
                          <input type="checkbox" value={t.id} checked={selected} disabled={!t.isActive} onChange={e=>{setSelectedTemplateIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id));}}/>
                          <span className="min-w-0 flex-1 truncate">{courseTemplateLabel(t)}</span>
                          {!t.isActive&&<span className="rounded-full bg-earth-200 px-2 py-0.5 text-[11px]">已下架</span>}
                        </label>;
                      })}
                    </section>)}
                    {!visibleTemplates.length&&<p className="py-6 text-center text-sm text-earth-500">沒有符合搜尋的課程</p>}
                  </div>
                </fieldset></div></details>
                {selectedTerms.filter(id=>!termSessions.some(s=>s.id===id)).map(id=><input key={id} type="hidden" name="termSessionIds" value={id}/>)}<details data-plan-section="dates" name="fitness-plan-sections" hidden={planKind!=="TERM"} open={planKind==="TERM"} className="sm:col-span-2"><summary className="min-h-11 cursor-pointer py-2 text-sm">上課日期 · 已選 {selectedTerms.length} 堂</summary><p className="text-sm text-earth-600">選取堂數須與整期堂數一致；購買時一次預約全期。未到扣堂，不發補課券。</p><div className="max-h-48 overflow-y-auto">{termSessions.map(s=><label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="termSessionIds" value={s.id} checked={selectedTerms.includes(s.id)} onChange={e=>draft.set("terms",JSON.stringify(e.target.checked?[...selectedTerms,s.id]:selectedTerms.filter(id=>id!==s.id)))}/>{formatTWDateTime(new Date(s.startsAt))} · {s.name}</label>)}</div></details>
                </>}
                {!music&&profitEnabled&&<>
                <details name="fitness-plan-sections" className="sm:col-span-2"><summary className="min-h-11 cursor-pointer border-t border-earth-100 py-2 text-sm">更多設定</summary><fieldset className="flex flex-wrap items-end gap-4"><legend className="sr-only">方案使用方式</legend>{profitEnabled&&<label className="block max-w-xs text-sm">店家成本<input className={field} name="storeCost" type="number" min="0" required value={draft.values.storeCost} onChange={e=>draft.set("storeCost",e.target.value)}/></label>}{profitEnabled&&<p><span className="text-earth-500">預估利潤</span><strong className={`ml-2 ${estimatedProfit<0?"text-red-700":"text-primary-800"}`}>NT$ {estimatedProfit.toLocaleString("zh-TW")}</strong></p>}</fieldset></details>
                </>}
                {!music&&<p className="sm:col-span-2 text-sm text-earth-500">
                  修改僅影響新購買；下架保留既有額度。
                </p>}
              </>}</fieldset></form>;
}
