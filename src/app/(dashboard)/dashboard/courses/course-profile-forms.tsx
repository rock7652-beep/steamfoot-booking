"use client";
import { useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { BirthdayFields } from "@/components/birthday-fields";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { saveCourseCustomer, saveCoursePointPlan } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
import { coursePlanSnapshot } from "@/lib/course-plan-snapshot";
export type Person = { id: string; updatedAt?: string; name: string; phone: string; email: string | null; gender: string | null; birthday: string; serviceNote: string | null; address: string | null; notes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null };
export type Plan = {
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
type Callbacks={onPending:(value:boolean)=>void;onSaved:()=>void};
function useSaveForm(draft: Pick<ReturnType<typeof useFormDraft>,"busy"|"mounted"|"stale"|"clear">, {onPending,onSaved}:Callbacks){
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
export function CoursePlanDraftForm({plan,templates,termSessions,profitEnabled,...callbacks}:Callbacks&{plan:Plan|null;templates:{id:string;name:string;category:string;isActive:boolean}[];termSessions:{id:string;name:string;startsAt:string}[];profitEnabled:boolean}){
 const draft=useFormDraft<Record<string,string>>(`course-plan:${plan?.id??"new"}`,{name:plan?.name??"",unit:plan?.unit??"POINT",active:plan?.isActive===false?"no":"yes",points:String(plan?.points??10),price:String(plan?.price??0),storeCost:String(plan?.storeCost??0),days:String(plan?.validDays??90),purchaseMode:plan?.customerPurchasable===false?"backend":"customer",allowShared:plan?.allowShared?"yes":"no",templates:JSON.stringify(plan?.templateIds??[]),terms:JSON.stringify(plan?.termSessionIds??[])},plan?JSON.stringify(coursePlanSnapshot(plan)):null);
 const {submit,error,pending}=useSaveForm(draft,callbacks);
 const [templateSearch,setTemplateSearch]=useState("");
 const parseIds=(raw:string):string[]=>{try{const v:unknown=JSON.parse(raw);return Array.isArray(v)&&v.every(x=>typeof x==="string")?v:[];}catch{return [];}};
 const selectedTemplateIds=parseIds(draft.values.templates),selectedTerms=parseIds(draft.values.terms);
 const setSelectedTemplateIds:Dispatch<SetStateAction<string[]>>=next=>draft.set("templates",JSON.stringify(typeof next==="function"?next(selectedTemplateIds):next));
 const visibleTemplates=templates.filter(t=>t.name.toLocaleLowerCase().includes(templateSearch.trim().toLocaleLowerCase()));
 const templateGroups=[...new Set(visibleTemplates.map(t=>t.category||"未分類"))];
 const unitPrice=Math.round(Number(draft.values.price)/Math.max(1,Number(draft.values.points)));
 const estimatedProfit=Number(draft.values.price)-Number(draft.values.storeCost);
 return <form id="course-member-form" className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={e=>void submit(e,d=>saveCoursePointPlan({id:plan?.id,expectedSnapshot:draft.expectedRevision??undefined,name:d.get("name"),points:Number(d.get("points")),price:Number(d.get("price")),storeCost:profitEnabled?Number(d.get("storeCost")):(plan?.storeCost??0),termSessionIds:d.getAll("termSessionIds"),customerPurchasable:d.get("purchaseMode")==="customer",allowShared:d.get("allowShared")==="yes",validDays:Number(d.get("days")),isActive:d.get("active")==="yes",unit:d.get("unit"),templateIds:d.getAll("templateIds")}))}>
 <div className="sm:col-span-2"><FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={()=>draft.discard()}/>{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
 <fieldset disabled={pending} className="contents">
                <label className="block sm:col-span-2">
                  名稱
                  <input
                    className={field}
                    name="name"
                    value={draft.values.name} onChange={e=>draft.set("name",e.target.value)}
                    required
                  />
                </label>
                <label className="block">額度單位<select className={field} name="unit" value={draft.values.unit} onChange={e=>draft.set("unit",e.target.value)}><option value="POINT">點數</option><option value="SESSION">堂數（每堂使用 1 堂）</option></select></label>
                <label className="block">狀態<select className={field} name="active" value={draft.values.active} onChange={e=>draft.set("active",e.target.value)}><option value="yes">上架</option><option value="no">下架</option></select></label>
                <label className="sm:col-span-2">搜尋適用課程<input className={field} value={templateSearch} onChange={e=>setTemplateSearch(e.target.value)} placeholder="輸入課程名稱篩選；未輸入會顯示全部課程"/></label>
                <fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3">
                  <legend className="px-1">適用課程（未勾選表示全部課程）</legend>
                  {selectedTemplateIds.map(id=><input key={id} type="hidden" name="templateIds" value={id}/>)}
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-earth-100 pb-2 text-sm">
                    <span className="text-earth-600">已選 {selectedTemplateIds.length} 堂 · 顯示 {visibleTemplates.length} 堂</span>
                    <span className="flex gap-2">
                      <button type="button" className={button} onClick={()=>{setSelectedTemplateIds(ids=>[...new Set([...ids,...visibleTemplates.filter(t=>t.isActive).map(t=>t.id)])]);}}>全選目前結果</button>
                      <button type="button" className={button} onClick={()=>{setSelectedTemplateIds(ids=>ids.filter(id=>!visibleTemplates.some(t=>t.id===id&&t.isActive)));}}>清除目前結果</button>
                    </span>
                  </div>
                  <div className="max-h-64 space-y-3 overflow-y-auto overscroll-contain pr-1">
                    {templateGroups.map(group=><section key={group} aria-label={group}>
                      <h3 className="sticky top-0 bg-white py-1 text-xs font-semibold text-earth-500">{group}</h3>
                      {visibleTemplates.filter(t=>(t.category||"未分類")===group).map(t=>{
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
                </fieldset>
                {selectedTerms.filter(id=>!termSessions.some(s=>s.id===id)).map(id=><input key={id} type="hidden" name="termSessionIds" value={id}/>)}<details className="sm:col-span-2"><summary className="cursor-pointer py-2">期課：連結指定課次（選填）</summary><p className="text-sm text-earth-600">未選為自由預約；選擇後請使用堂數方案，課次数須等於販售堂數。結帳會一次預約全期；未到仍扣堂，不提供補課券。</p><div className="max-h-48 overflow-y-auto">{termSessions.map(s=><label key={s.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="termSessionIds" value={s.id} checked={selectedTerms.includes(s.id)} onChange={e=>draft.set("terms",JSON.stringify(e.target.checked?[...selectedTerms,s.id]:selectedTerms.filter(id=>id!==s.id)))}/>{formatTWDateTime(new Date(s.startsAt))} · {s.name}</label>)}</div></details>
                {[
                  ["額度", "points", plan?.points ?? 10, 1],
                  ["售價", "price", plan?.price ?? 0, 0],
                  ["店家成本", "storeCost", plan?.storeCost ?? 0, 0],
                  ["有效天數", "days", plan?.validDays ?? 90, 1],
                ].filter(([,name])=>profitEnabled||name!=="storeCost").map(([label, name, , min]) => (
                  <label key={String(name)} className="block">
                    {label}
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
                ))}
                <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-lg bg-primary-50 p-3 text-sm"><p><span className="text-earth-500">單位價格</span><strong className="block text-primary-800">NT$ {unitPrice.toLocaleString("zh-TW")}／單位</strong></p>{profitEnabled&&<p><span className="text-earth-500">預估利潤</span><strong className={`block ${estimatedProfit<0?"text-red-700":"text-primary-800"}`}>NT$ {estimatedProfit.toLocaleString("zh-TW")}</strong></p>}</div>
                <fieldset className="sm:col-span-2 rounded-lg border border-earth-200 p-3"><legend className="px-1">方案使用方式</legend><div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="radio" name="purchaseMode" value="customer" checked={draft.values.purchaseMode==="customer"} onChange={()=>draft.set("purchaseMode","customer")}/>顧客可購買</label><label className="flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="radio" name="purchaseMode" value="backend" checked={draft.values.purchaseMode==="backend"} onChange={()=>draft.set("purchaseMode","backend")}/>僅後台指派</label></div><label className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-earth-200 px-3"><input type="checkbox" name="allowShared" value="yes" checked={draft.values.allowShared==="yes"} onChange={e=>draft.set("allowShared",e.target.checked?"yes":"no")}/>允許共卡</label></fieldset>
                <p className="sm:col-span-2 text-sm text-earth-500">
                  修改預設不影響已指派方案；方案下架也會保留顧客已持有的額度。提供點數與堂數方案，無自動續費。
                </p>
              </fieldset></form>;
}
