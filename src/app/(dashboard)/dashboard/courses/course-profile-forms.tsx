"use client";
import { useEffect, useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { BirthdayFields } from "@/components/birthday-fields";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { saveCourseCustomer, saveCoursePointPlan } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
import { coursePlanSnapshot } from "@/lib/course-plan-snapshot";
import { musicPlanQuote } from "@/lib/music-course-products";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
export type Person = { id: string; updatedAt?: string; name: string; phone: string; email: string | null; gender: string | null; birthday: string; serviceNote: string | null; address: string | null; notes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null };
export type Plan = {
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

const field="min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
type Callbacks={onPending:(value:boolean)=>void;onSaved:()=>void;onDirtyChange?:(value:boolean)=>void};
function useSaveForm(draft: Pick<ReturnType<typeof useFormDraft>,"busy"|"mounted"|"stale"|"clear"|"dirty">, {onPending,onSaved,onDirtyChange}:Callbacks){
 useEffect(()=>{onDirtyChange?.(draft.dirty);},[draft.dirty,onDirtyChange]);
 const router=useRouter();const [error,setError]=useState("");const [pending,setPending]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>,save:(data:FormData)=>Promise<{success:boolean;error?:string}>){
  event.preventDefault();if(draft.busy.current||draft.stale)return;
  const data=new FormData(event.currentTarget);draft.busy.current=true;setPending(true);onPending(true);setError("");
  try{const result=await save(data);if(!draft.mounted.current)return;
   if(!result.success){setError(result.error??"儲存失敗，輸入已保留");router.refresh();return;}
   draft.clear();onSaved();
  }catch{if(draft.mounted.current)setError("連線中斷，輸入已保留，請稍後重試。");}
  finally{draft.busy.current=false;if(draft.mounted.current){setPending(false);onPending(false);}}
 }
 return {submit,error,pending};
}
export function CourseCustomerDraftForm({person,canEdit,canCreate,hidden,...callbacks}:Callbacks&{person:Person|null;canEdit:boolean;canCreate:boolean;hidden:boolean}){
 const [year="1970",month="",day=""]=(person?.birthday??"").split("-");
 const draft=useFormDraft(`course-customer:${person?.id??"new"}`,{name:person?.name??"",phone:person?.phone??"",email:person?.email??"",gender:person?.gender??"",serviceNote:person?.serviceNote??"",address:person?.address??"",emergencyContactName:person?.emergencyContactName??"",emergencyContactPhone:person?.emergencyContactPhone??"",birthYear:year||"1970",birthMonth:month,birthDay:day},person?.updatedAt??null);
 const {submit,error,pending}=useSaveForm(draft,callbacks);
 return <form id="course-member-form" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${hidden?"hidden":""}`} onSubmit={e=>{
  if(person?!canEdit:!canCreate){e.preventDefault();return;}
  void submit(e,d=>saveCourseCustomer({id:person?.id,expectedUpdatedAt:draft.expectedRevision??undefined,name:d.get("name"),phone:d.get("phone"),email:d.get("email"),gender:d.get("gender"),birthday:d.get("birthday"),...(!person?{serviceNote:d.get("serviceNote")}:{}),address:d.get("address"),emergencyContactName:d.get("emergencyContactName"),emergencyContactPhone:d.get("emergencyContactPhone")}));
 }}>
 <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
 <fieldset disabled={pending} className="contents">
                <label className="block">
                  姓名
                  <input
                    className={field}
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
                    className={field}
                    name="phone"
                    value={draft.values.phone} onChange={e=>draft.set("phone",e.target.value)}
                    readOnly={person ? !canEdit : !canCreate}
                    maxLength={30}
                    required
                  />
                </label>
                <fieldset disabled={person ? !canEdit : !canCreate} className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <label className="block">電子信箱<input className={field} name="email" type="email" value={draft.values.email} onChange={e=>draft.set("email",e.target.value)} /></label>
                  <label className="block">性別<select className={field} name="gender" value={draft.values.gender} onChange={e=>draft.set("gender",e.target.value)}><option value="">未填</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option></select></label>
                  <div>生日<BirthdayFields parts={{year:draft.values.birthYear,month:draft.values.birthMonth,day:draft.values.birthDay}} onPartsChange={p=>draft.setMany({birthYear:p.year,birthMonth:p.month,birthDay:p.day})} className={field} /></div>
                  <label className="block">緊急聯絡人姓名<input className={field} name="emergencyContactName" maxLength={100} value={draft.values.emergencyContactName} onChange={e=>draft.set("emergencyContactName",e.target.value)} /></label>
                  <label className="block">緊急聯絡人電話<input className={field} name="emergencyContactPhone" type="tel" maxLength={30} value={draft.values.emergencyContactPhone} onChange={e=>draft.set("emergencyContactPhone",e.target.value)} /></label>
                  {!person && <label className="block">店內備註<textarea className={field} name="serviceNote" value={draft.values.serviceNote} onChange={e=>draft.set("serviceNote",e.target.value)} maxLength={1000} /></label>}
                  <label className="block">地址<input className={field} name="address" maxLength={300} value={draft.values.address} onChange={e=>draft.set("address",e.target.value)} /></label>
                </fieldset>
              </fieldset></form>;
}
export function CoursePlanDraftForm({plan,templates,subjects=[],musicTeachers=[],canEditMusicTeachers=false,termSessions,profitEnabled,music=false,sharedCardState="ENABLED",initialTemplateId,...callbacks}:Callbacks&{musicTeachers?:{id:string;name:string;active:boolean;qualificationIds:string[]}[];canEditMusicTeachers?:boolean;subjects?:{id:string;name:string;category:string;isActive:boolean}[];plan:Plan|null;templates:{id:string;name:string;category:string;isActive:boolean;musicTeacherShare?:number|null;musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicTrialMode?:string|null;musicSubjectId?:string|null;classType?:string|null;musicScheduleMode?:string|null}[];termSessions:{id:string;name:string;startsAt:string}[];profitEnabled:boolean;music?:boolean;sharedCardState?:FeaturePresentationState;initialTemplateId?:string}){
 const initialRule=templates.find(t=>t.id===(plan?.templateIds[0]??initialTemplateId));
 const paidLessons=plan ? plan.points-(plan.musicBonusLessons??0) : 0;
 const savedPeriod=plan?.musicTermSizes?.[0]??(plan&&paidLessons%(plan.musicTerms??1)===0?paidLessons/(plan.musicTerms??1):null);
 const initialSubject=initialRule?.musicSubjectId??(subjects.some(s=>s.id===initialTemplateId)?initialTemplateId:"");
 const subjectTeachers=(subjectId:string)=>musicTeachers.filter(t=>t.qualificationIds.some(id=>templates.some(v=>v.id===id&&v.musicSubjectId===subjectId))).map(t=>t.id);
 const draft=useFormDraft<Record<string,string>>(`course-plan-v3:${plan?.id??`new:${initialTemplateId??"all"}`}`,{teacherIds:JSON.stringify(subjectTeachers(initialSubject??"")),expectedTeacherIds:JSON.stringify(subjectTeachers(initialSubject??"")),subjectId:initialSubject??"",classType:initialRule?.classType??"PRIVATE",musicTeacherShare:String(initialRule?.musicTeacherShare??0.6),musicPricePerLesson:String(plan&&paidLessons>0?plan.price/paidLessons:initialRule?.musicPricePerLesson??800),musicTermLessons:String(savedPeriod??initialRule?.musicTermLessons??4),musicValidityDaysPerTerm:String(plan?plan.validDays/(plan.musicTerms??1):initialRule?.musicValidityDaysPerTerm??35),musicScheduleMode:initialRule?.musicScheduleMode??"FIXED",name:plan?.name??"",kind:plan?.termSessionIds?.length?"TERM":plan?.unit??"POINT",scope:plan?.templateIds.length||initialTemplateId?"selected":"all",unit:music?"SESSION":plan?.unit??"POINT",active:plan?.isActive===false?"no":"yes",points:String(plan?.points??(music?4:10)),price:String(plan?.price??0),storeCost:String(plan?.storeCost??0),days:String(plan?.validDays??90),musicTerms:String(plan?.musicTerms??1),musicBonusLessons:String(plan?.musicBonusLessons??0),purchaseMode:plan?.customerPurchasable===false?"backend":"customer",allowShared:plan?.allowShared?"yes":"no",templates:JSON.stringify(plan?.templateIds??(initialTemplateId?[initialTemplateId]:[])),terms:JSON.stringify(plan?.termSessionIds??[])},plan?JSON.stringify({...coursePlanSnapshot(plan),musicTerms:plan.musicTerms}):null);
 const itemRule=templates.find(t=>t.musicSubjectId===draft.values.subjectId);
 const {submit,error,pending}=useSaveForm(draft,callbacks);
 const [templateSearch,setTemplateSearch]=useState("");
 const planKind=draft.values.kind,courseScope=draft.values.scope;
 const [selectionError,setSelectionError]=useState("");
 const parseIds=(raw:string):string[]=>{try{const v:unknown=JSON.parse(raw);return Array.isArray(v)&&v.every(x=>typeof x==="string")?v:[];}catch{return [];}};
 const selectedTemplateIds=parseIds(draft.values.templates),selectedTerms=parseIds(draft.values.terms);
 const setSelectedTemplateIds:Dispatch<SetStateAction<string[]>>=next=>draft.set("templates",JSON.stringify(typeof next==="function"?next(selectedTemplateIds):next));
 const visibleTemplates=templates.filter(t=>t.name.toLocaleLowerCase().includes(templateSearch.trim().toLocaleLowerCase()));
 const templateGroup=(t:typeof templates[number])=>music ? t.category||"未分類" : t.classType==="GROUP"?"團體課":t.classType==="PRIVATE"?"個別課":t.classType==="SELF_ORGANIZED"?"自組課":"未設定班別";
 const templateGroups=[...new Set(visibleTemplates.map(templateGroup))];
 const musicQuote=music&&draft.values.subjectId?(()=>{try{return musicPlanQuote({musicPricePerLesson:Number(draft.values.musicPricePerLesson),musicTermLessons:Number(draft.values.musicTermLessons),musicValidityDaysPerTerm:Number(draft.values.musicValidityDaysPerTerm)},1);}catch{return null;}})():null;
 const unitPrice=music?Number(draft.values.musicPricePerLesson):Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)));
 const estimatedProfit=(music?musicQuote?.price??0:Number(draft.values.price))-Number(draft.values.storeCost);
 const preservePeriods=!!plan&&Number(draft.values.points)===plan.points;
 const feeTerms=preservePeriods?plan.musicTerms??1:1;
 const feeBonus=preservePeriods?plan.musicBonusLessons??0:0;
 const feeLessons=(Number(draft.values.points)-feeBonus)/feeTerms;
 if(music) return <form id="course-member-form" className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={e=>{if(!parseIds(draft.values.teacherIds).length){e.preventDefault();setSelectionError("請至少選擇一位可授課教師");return;}setSelectionError("");void submit(e,()=>saveCoursePointPlan({
   id:plan?.id,expectedSnapshot:draft.expectedRevision??undefined,
   musicTeacherIds:parseIds(draft.values.teacherIds),expectedMusicTeacherIds:parseIds(draft.values.expectedTeacherIds),
   name:draft.values.name,points:Number(draft.values.points),price:Number(draft.values.price),
   storeCost:plan?.storeCost??0,validDays:Number(draft.values.days),
   musicTerms:feeTerms,musicBonusLessons:feeBonus,termSessionIds:[],templateIds:[],unit:"SESSION",
   customerPurchasable:plan?.customerPurchasable??true,allowShared:plan?.allowShared??false,isActive:plan?.isActive??true,
   musicSetup:{subjectId:draft.values.subjectId,classType:itemRule?.classType??null,
     musicTeacherShare:Number(draft.values.musicTeacherShare),totalPrice:Number(draft.values.price),
     musicPricePerLesson:Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)-feeBonus)),
     musicTermLessons:feeLessons,musicValidityDaysPerTerm:Number(draft.values.days)/feeTerms,
     musicScheduleMode:itemRule?.musicScheduleMode??"FIXED"}
 }));}}>
   <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
   {selectionError&&<p role="alert" className="sm:col-span-2 text-red-700">{selectionError}</p>}
   <fieldset disabled={pending} className="contents">
     <label className="sm:col-span-2">教學項目<select className={field} required value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,teacherIds:JSON.stringify(subjectTeachers(e.target.value)),expectedTeacherIds:JSON.stringify(subjectTeachers(e.target.value))})}><option value="">請先選擇教學項目</option>{subjects.filter(s=>s.isActive||s.id===draft.values.subjectId).map(s=><option key={s.id} value={s.id}>{s.name}{s.isActive?"":"（下架）"}</option>)}</select></label>
                <fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3"><legend className="px-1 font-medium">可授課教師</legend><p className="mb-2 text-sm text-earth-600">與教師管理的可教授教學項目同步；同一項目下所有收費方式共用。</p><div className="grid gap-x-3 sm:grid-cols-2">{musicTeachers.filter(t=>t.active||parseIds(draft.values.teacherIds).includes(t.id)).map(t=><label key={t.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!canEditMusicTeachers||!draft.values.subjectId||!t.active} checked={parseIds(draft.values.teacherIds).includes(t.id)} onChange={e=>draft.set("teacherIds",JSON.stringify(e.target.checked?[...parseIds(draft.values.teacherIds),t.id]:parseIds(draft.values.teacherIds).filter(id=>id!==t.id)))}/>{t.name}{!t.active&&"（已停用）"}</label>)}</div>{!musicTeachers.length&&<p>尚無教師，請先至教師管理建立。</p>}{!canEditMusicTeachers&&<p className="text-sm text-earth-600">修改授課教師需要人員管理權限。</p>}</fieldset>
     <label className="sm:col-span-2">收費名稱<input className={field} required maxLength={80} value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}/></label>
     <label>收費金額<input className={field} required type="number" min={0} max={10000000} step={1} value={draft.values.price} onChange={e=>draft.set("price",e.target.value)}/></label>
     <label>{preservePeriods&&feeTerms>1?"總堂數（保留既有期別）":"每期堂數"}<input className={field} required type="number" min={1} max={1000} step={1} value={draft.values.points} onChange={e=>draft.set("points",e.target.value)}/></label>
     <label>有效天數<input aria-label="收費有效天數" className={field} required type="number" min={1} max={3650} value={draft.values.days} onChange={e=>draft.set("days",e.target.value)}/></label>
     <p className="self-center text-earth-600">購買時選擇幾期，堂數、金額與效期依期數計算。</p>
     <label className="sm:col-span-2">拆帳比例（老師 %）<input className={field} required type="number" min={0} max={100} step={1} value={Math.round(Number(draft.values.musicTeacherShare)*100)} onChange={e=>draft.set("musicTeacherShare",String(Number(e.target.value)/100))}/></label>
   </fieldset>
 </form>;
 return <form id="course-member-form" className="grid grid-cols-1 gap-3 sm:grid-cols-2" onInvalidCapture={e=>{const section=(e.target as HTMLElement).closest("details");if(section)section.open=true;(e.target as HTMLElement).scrollIntoView?.({block:"nearest"});}} onSubmit={e=>{if(!music&&((courseScope==="selected"&&!selectedTemplateIds.length)||(planKind==="TERM"&&selectedTerms.length!==Number(draft.values.points)))){e.preventDefault();const section=e.currentTarget.querySelector<HTMLDetailsElement>(courseScope==="selected"&&!selectedTemplateIds.length?'[data-plan-section="courses"]':'[data-plan-section="dates"]');if(section){section.open=true;section.scrollIntoView?.({block:"nearest"});}setSelectionError(courseScope==="selected"&&!selectedTemplateIds.length?"請選至少一門適用課程，或改為全部課程。":"上課日期數須與整期堂數一致。");return;}setSelectionError("");void submit(e,d=>saveCoursePointPlan({id:plan?.id,...(music?{musicSetup:{musicTeacherShare:Number(itemRule?.musicTeacherShare??draft.values.musicTeacherShare),subjectId:draft.values.subjectId,classType:itemRule?.classType??draft.values.classType,musicPricePerLesson:Number(draft.values.musicPricePerLesson),musicTermLessons:Number(draft.values.musicTermLessons),musicValidityDaysPerTerm:Number(draft.values.musicValidityDaysPerTerm),musicScheduleMode:itemRule?.musicScheduleMode??draft.values.musicScheduleMode}}:{}),expectedSnapshot:draft.expectedRevision??undefined,name:d.get("name"),points:music?musicQuote?.lessons??0:Number(d.get("points")),price:music?musicQuote?.price??0:Number(d.get("price")),storeCost:music?0:profitEnabled?Number(d.get("storeCost")):(plan?.storeCost??0),termSessionIds:music||planKind==="TERM"?d.getAll("termSessionIds"):[],customerPurchasable:d.get("purchaseMode")==="customer",allowShared:!music&&sharedCardState!=="ENABLED"?!!plan?.allowShared:!music&&planKind==="TERM"?false:d.get("allowShared")==="yes",validDays:music?musicQuote?.validDays??0:Number(d.get("days")),musicTerms:music?1:null,musicBonusLessons:0,isActive:d.get("active")==="yes",unit:music?"SESSION":d.get("unit"),templateIds:music||courseScope==="selected"?d.getAll("templateIds"):[]}));}}>
 <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
 {selectionError&&<p role="alert" className="sm:col-span-2 text-sm text-red-700">{selectionError}</p>}
 <fieldset disabled={pending} className="contents">
                {music&&<label className="sm:col-span-2">教學項目<select aria-label="收費教學項目" className={field} required value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,teacherIds:JSON.stringify(subjectTeachers(e.target.value)),expectedTeacherIds:JSON.stringify(subjectTeachers(e.target.value))})}><option value="">請先選擇教學項目</option>{subjects.filter(s=>s.isActive||s.id===draft.values.subjectId).map(s=><option key={s.id} value={s.id}>{s.name}{!s.isActive?"（不開放）":""}</option>)}</select></label>}
                <label className={music ? "block" : "block sm:col-span-2"}>
                  {music?"學費方案名稱（小類）":"名稱 *"}
                  <input
                    className={field}
                    name="name"
                    value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}
                    required
                  />
                </label>
                {music?<input type="hidden" name="unit" value="SESSION"/>:<label className="block">計費方式<select className={field} value={planKind} onChange={e=>{draft.setMany({kind:e.target.value,unit:e.target.value==="TERM"?"SESSION":e.target.value});}}><option value="POINT">點數</option><option value="SESSION">堂數</option><option value="TERM">期課</option></select><input type="hidden" name="unit" value={planKind==="TERM"?"SESSION":draft.values.unit}/></label>}
                <label className="block">狀態<select className={field} name="active" value={draft.values.active} onChange={e=>draft.set("active",e.target.value)}><option value="yes">上架</option><option value="no">下架</option></select></label>
                {music&&<>
                <label>所屬教學項目（大類）<select className={field} required value={draft.values.subjectId} onChange={e=>draft.setMany({subjectId:e.target.value,teacherIds:JSON.stringify(subjectTeachers(e.target.value)),expectedTeacherIds:JSON.stringify(subjectTeachers(e.target.value))})}><option value="">請選擇教學項目</option>{subjects.filter(s=>s.isActive||s.id===draft.values.subjectId).map(s=><option key={s.id} value={s.id}>{s.name}{!s.isActive?"（下架）":""}</option>)}</select></label>
                <div className="self-center text-earth-700">授課型態：{({PRIVATE:"個別課",SELF_ORGANIZED:"自組班",GROUP:"團體班"} as Record<string,string>)[itemRule?.classType??draft.values.classType]}<span className="block text-sm">依教學項目設定</span></div>
                <label>每堂學費<input className={field} type="number" min="0" max="1000000" required value={draft.values.musicPricePerLesson} onChange={e=>draft.set("musicPricePerLesson",e.target.value)}/></label>
                <label>每期堂數<input className={field} type="number" min="1" max="1000" required value={draft.values.musicTermLessons} onChange={e=>draft.set("musicTermLessons",e.target.value)}/></label>
                <label>每期有效天數<input className={field} type="number" min="1" max="3650" required value={draft.values.musicValidityDaysPerTerm} onChange={e=>{draft.set("musicValidityDaysPerTerm",e.target.value);}}/></label>
                <p className="sm:col-span-2 rounded-lg bg-primary-50 p-3 text-primary-900">{musicQuote?`每期 ${musicQuote.lessons} 堂 · ${musicQuote.validDays} 天 · NT$ ${musicQuote.price.toLocaleString("zh-TW")}`:"請選擇教學項目並填寫學費方案"}</p>
                <details className="sm:col-span-2"><summary className="cursor-pointer py-2">進階設定</summary><div className="grid gap-3 sm:grid-cols-2"><label>購買方式<select className={field} name="purchaseMode" value={draft.values.purchaseMode} onChange={e=>draft.set("purchaseMode",e.target.value)}><option value="customer">顧客可購買</option><option value="backend">僅後台指派</option></select></label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="allowShared" value="yes" disabled={planKind==="TERM"} checked={planKind!=="TERM"&&draft.values.allowShared==="yes"} onChange={e=>draft.set("allowShared",e.target.checked?"yes":"no")}/>允許共用堂數</label></div></details>
                </>}

                {!music&&<>
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">{[
                  ["額度", "points", plan?.points ?? 10, 1],
                  ["售價", "price", plan?.price ?? 0, 0],
                  ["店家成本", "storeCost", plan?.storeCost ?? 0, 0],
                  ["有效期（天）", "days", plan?.validDays ?? 90, 1],
                ].filter(([,name])=>name!=="storeCost").map(([label, name, , min]) => (
                  <label key={String(name)} className="block">
                    {name==="points"?(planKind==="POINT"?"總點數":planKind==="TERM"?"整期堂數":"總堂數"):label} *
                    <input
                      className={field}
                      name={String(name)}
                      type="number"
                      min={Number(min)}
                      value={draft.values[String(name)]}
                      onChange={e=>draft.set(String(name),e.target.value)}
                      required
                    />
                  </label>
                ))}</div>
                <div className="sm:col-span-2 flex flex-wrap gap-x-5 gap-y-1 py-1 text-sm"><p><span className="text-earth-500">單位價格</span><strong className="ml-2 text-primary-800">NT$ {unitPrice.toLocaleString("zh-TW")}／{draft.values.unit==="POINT"?"點":"堂"}</strong></p></div>
                <fieldset className="sm:col-span-2"><legend className="mb-1 text-sm">{sharedCardState==="HIDDEN"?"購買方式":"購買方式與共卡"}</legend><div className="flex flex-wrap gap-x-5 gap-y-1"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="customer" checked={draft.values.purchaseMode==="customer"} onChange={()=>draft.set("purchaseMode","customer")}/>顧客可購買</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="purchaseMode" value="backend" checked={draft.values.purchaseMode==="backend"} onChange={()=>draft.set("purchaseMode","backend")}/>僅後台指派</label>{sharedCardState!=="HIDDEN"&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="allowShared" value="yes" disabled={planKind==="TERM"||sharedCardState!=="ENABLED"} checked={sharedCardState!=="ENABLED"?!!plan?.allowShared:planKind!=="TERM"&&draft.values.allowShared==="yes"} onChange={e=>draft.set("allowShared",e.target.checked?"yes":"no")}/>允許共卡{sharedCardState==="LOCKED"&&<span className="text-earth-500">（功能未開通）</span>}</label>}</div></fieldset>
                <details data-plan-section="courses" name="fitness-plan-sections" className="sm:col-span-2"><summary className="flex min-h-11 cursor-pointer items-center justify-between border-t border-earth-100 text-sm"><span>適用課程</span><span className="text-earth-500">{courseScope==="all"?"全部課程":`已選 ${selectedTemplateIds.length} 門`} <span className="ml-2 text-primary-700">修改</span></span></summary><label className="block text-sm">範圍<select className={field} value={courseScope} onChange={e=>draft.set("scope",e.target.value)}><option value="all">全部課程</option><option value="selected">指定課程</option></select></label><div hidden={courseScope!=="selected"}><label className="block">搜尋課程<input className={field} value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="搜尋課程名稱"/></label>
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
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
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
              </fieldset></form>;
}
