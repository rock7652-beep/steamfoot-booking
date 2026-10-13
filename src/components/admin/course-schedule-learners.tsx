"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {loadCourseScheduleEnrollmentOptions,loadCourseScheduleCustomerCards,createScheduleCustomer,loadCourseSchedulePurchaseOptions} from "@/server/actions/course-schedule-enrollment";
import {assignCoursePointCard} from "@/server/actions/course-members";
import {MusicAssignmentPayment} from "@/components/admin/music-assignment-payment";
import {usePanelReader} from "@/components/operations/panel-read-cache";
export type ScheduleLearner={customerId:string;cardId:string;name:string;trialPrice?:number};
type Card=Extract<Awaited<ReturnType<typeof loadCourseScheduleEnrollmentOptions>>,{success:true}>["cards"][number];
type PurchaseData=Extract<Awaited<ReturnType<typeof loadCourseSchedulePurchaseOptions>>,{success:true}>["data"];
export function CourseScheduleLearners({templateId,pointCost,capacity,value,onChange,disabled=false,scope="",occurrenceCount=1,onValidityChange,trialMode=false,canCreateCustomer=false,onPendingChange,onDraftChange}:{onDraftChange?:(dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;trialMode?:boolean;canCreateCustomer?:boolean;templateId:string;pointCost:number;capacity:number;value:ScheduleLearner[];onChange:(value:ScheduleLearner[])=>void;disabled?:boolean;scope?:string;occurrenceCount?:number;onValidityChange?:(valid:boolean)=>void}) {
  const reader=usePanelReader("course-schedule-learners",loadCourseScheduleEnrollmentOptions,scope,8_000);
  const [cards,setCards]=useState<Card[]>([]);
  const [customers,setCustomers]=useState<{id:string;name:string;phone:string}[]>([]);
  const [cardsLoading,setCardsLoading]=useState<Set<string>>(()=>new Set());
  const cardsLoadedRef=useRef(new Set<string>());
  const cardsInFlight=useRef(new Set<string>());
  const [trial,setTrial]=useState({enabled:false,price:0});
  const [newCustomer,setNewCustomer]=useState(false);
  const [supplementKey,setSupplementKey]=useState<string|null>(null);
  const [newName,setNewName]=useState("");
  const [newPhone,setNewPhone]=useState("");
  const [createError,setCreateError]=useState("");
  const [notice,setNotice]=useState("");
  const [purchaseFor,setPurchaseFor]=useState<string|null>(null);
  const [purchaseOptions,setPurchaseOptions]=useState<PurchaseData|null>(null);
  const [purchasePlanId,setPurchasePlanId]=useState("");
  const [purchaseSummary,setPurchaseSummary]=useState<{paid:number|null;valid:boolean}>({paid:null,valid:false});
  const [purchaseError,setPurchaseError]=useState("");
  const [purchaseLoading,setPurchaseLoading]=useState(false);
  const purchaseLoadToken=useRef(0);
  const [purchaseRequestKey,setPurchaseRequestKey]=useState(()=>crypto.randomUUID());
  const [purchasing,startPurchase]=useTransition();
  useEffect(()=>{onDraftChange?.(!!newName||!!newPhone);return()=>onDraftChange?.(false);},[newName,newPhone,onDraftChange]);
  const [creating,startCreate]=useTransition();
  useEffect(()=>{onPendingChange?.(creating);return()=>onPendingChange?.(false);},[creating,onPendingChange]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState<{templateId:string;message:string}|null>(null);
  const [loadedTemplate,setLoadedTemplate]=useState("");
  const [retry,setRetry]=useState(0);
  const loadCardsFor=useCallback(async(customerId:string)=>{
    if(trialMode||cardsLoadedRef.current.has(customerId)||cardsInFlight.current.has(customerId))return;
    cardsInFlight.current.add(customerId);
    setCardsLoading(current=>new Set(current).add(customerId));
    try {
      const result=await loadCourseScheduleCustomerCards(templateId,customerId);
      if(!result.success){setError({templateId,message:result.error??"學員方案讀取失敗"});return;}
      setCards(current=>[...current.filter(card=>!card.members.some(member=>member.id===customerId)),...result.cards]);
      cardsLoadedRef.current.add(customerId);
      setError(null);
    }catch{setError({templateId,message:"學員方案讀取失敗"});}
    finally{
      cardsInFlight.current.delete(customerId);
      setCardsLoading(current=>{const next=new Set(current);next.delete(customerId);return next;});
    }
  },[templateId,trialMode]);
  useEffect(()=>{
    let active=true;
    reader.read(templateId).then(result=>{if(!active)return;if(result.success){setCards(result.cards);setCustomers(result.customers??[]);setTrial(result.trialSettings??{enabled:false,price:0});setLoadedTemplate(templateId);setError(null);}else setError({templateId,message:result.error??"學員讀取失敗"});}).catch(()=>{if(active)setError({templateId,message:"學員讀取失敗"});});
    return()=>{active=false;};
  },[reader,templateId,retry]);
  useEffect(()=>{purchaseLoadToken.current+=1;setPurchaseFor(null);setPurchaseOptions(null);setPurchaseLoading(false);return()=>{purchaseLoadToken.current+=1;};},[templateId]);
  const ready=loadedTemplate===templateId;
  useEffect(()=>{if(ready&&!trialMode)for(const row of value)if(!row.customerId.startsWith("trial-draft:"))void loadCardsFor(row.customerId);},[ready,trialMode,value,loadCardsFor]);
  const requiredFor=(card:Card)=>occurrenceCount*(card.unit==="SESSION"?1:pointCost);
  const available=ready?cards.filter(card=>card.available>=requiredFor(card)):[];
  const totalRequired=(card:Card)=>value.filter(row=>row.cardId===card.id).length*requiredFor(card);
  const enrollmentValid=value.length<=capacity&&value.every(row=>{
    if(!row.cardId)return ready&&trial.enabled&&Number.isInteger(row.trialPrice)&&row.trialPrice!>=0;
    const card=cards.find(item=>item.id===row.cardId&&item.members.some(member=>member.id===row.customerId));
    return !ready?false:!!card&&card.available>=totalRequired(card);
  });
  useEffect(()=>{onValidityChange?.(enrollmentValid);},[enrollmentValid,onValidityChange]);
  const people=[...new Map([...customers.map(person=>[person.id,person] as const),...available.flatMap(card=>card.members.filter(member=>member.id).map(member=>[member.id!,{id:member.id!,name:member.name,phone:member.phone}] as const))]).values()];
  const matches=query.trim()?people.filter(person=>!value.some(row=>row.customerId===person.id)&&(person.name.includes(query.trim())||person.phone.includes(query.trim()))).slice(0,30):[];
  return <section aria-label="排課學員" className="col-span-full space-y-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-x-2"><strong>加入學員</strong><span>{value.length} / {capacity} 人{occurrenceCount>1?` · 共 ${occurrenceCount} 堂`:""}</span></div>
    {value.map(row=>{const memberCards=cards.filter(card=>card.members.some(member=>member.id===row.customerId));const selectedCard=memberCards.find(card=>card.id===row.cardId);const enough=row.cardId?!!selectedCard&&selectedCard.available>=totalRequired(selectedCard):trial.enabled&&row.trialPrice!==undefined;return <div key={row.customerId} className="flex flex-wrap items-center gap-2 rounded-lg bg-earth-50 px-3 py-1">
      <strong className="min-w-0 flex-1">{row.name}</strong>
      {!row.cardId&&trial.enabled&&row.trialPrice!==undefined?<span className="text-earth-600">體驗費 NT$ {(row.trialPrice??trial.price).toLocaleString()} · 本堂</span>:memberCards.length===1&&enough?<span className="min-w-0 break-words text-earth-600">{selectedCard!.name} · 可用 {selectedCard!.available}{occurrenceCount>1?` · 本次需 ${requiredFor(selectedCard!)}`:""}</span>:<select aria-label={`${row.name}的學員可用方案`} className="min-h-11 max-w-full rounded-lg border border-earth-200 bg-white px-2" disabled={disabled} value={row.cardId} onChange={event=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:event.target.value,trialPrice:event.target.value?undefined:trial.price}:item))}>
        {!selectedCard&&<option disabled value={row.cardId}>請選學員方案</option>}
        {memberCards.map(card=><option key={card.id} value={card.id} disabled={card.available<requiredFor(card)}>{card.name} · 可用 {card.available} · 本次需 {requiredFor(card)}</option>)}
      </select>}
      {canCreateCustomer&&row.customerId.startsWith("trial-draft:")&&newCustomer&&supplementKey===row.customerId&&<span className="text-sm text-primary-700">正在補齊資料</span>}
      <button type="button" aria-label={`移除${row.name}`} disabled={disabled} className="min-h-11 min-w-11" onClick={()=>onChange(value.filter(item=>item.customerId!==row.customerId))}>×</button>
      {trial.enabled&&(row.cardId||row.trialPrice===undefined)&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:"",trialPrice:trial.price}:item))}>{row.cardId?"改為體驗":"設為體驗"}</button>}
      {!trialMode&&!row.cardId&&memberCards.length>0&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:memberCards[0].id,trialPrice:undefined}:item))}>使用學員方案</button>}
      {cardsLoading.has(row.customerId)&&<p role="status" className="w-full text-earth-600">讀取學員方案中…</p>}
      {!enough&&!cardsLoading.has(row.customerId)&&<p role="alert" className="w-full text-red-700">{!row.cardId&&row.trialPrice===undefined?"請選學員方案或體驗。":"請確認學員方案與可用額度。"}</p>}
      {!trialMode&&!row.customerId.startsWith("trial-draft:")&&!cardsLoading.has(row.customerId)&&!memberCards.some(card=>card.available>=requiredFor(card))&&<button type="button" className="min-h-11 rounded-lg border border-primary-300 bg-white px-3 font-medium text-primary-800" disabled={disabled||purchasing||!ready} onClick={async()=>{
        const request=++purchaseLoadToken.current;
        setPurchaseError("");setPurchaseFor(row.customerId);setPurchaseOptions(null);setPurchasePlanId("");setPurchaseSummary({paid:null,valid:false});setPurchaseRequestKey(crypto.randomUUID());setPurchaseLoading(true);
        try {
          const result=await loadCourseSchedulePurchaseOptions(templateId,row.customerId);
          if(request!==purchaseLoadToken.current)return;
          if(!result.success){setPurchaseError(result.error??"讀取可購買方案失敗");return;}
          setPurchaseOptions(result.data);setPurchasePlanId(result.data.plans[0]?.id??"");
        } catch {if(request===purchaseLoadToken.current)setPurchaseError("方案讀取失敗，請重試");}
        finally {if(request===purchaseLoadToken.current)setPurchaseLoading(false);}
      }}>新增繳費</button>}
      {purchaseFor===row.customerId&&!purchaseOptions&&<div className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary-200 bg-white p-3">
        <span role={purchaseError?"alert":"status"}>{purchaseError|| (purchaseLoading?"讀取適用方案中…":"")}</span>
        <button type="button" className="min-h-11 px-2 text-earth-600 underline" disabled={purchasing} onClick={()=>{purchaseLoadToken.current+=1;setPurchaseFor(null);setPurchaseOptions(null);setPurchaseError("");setPurchaseLoading(false);}}>取消</button>
      </div>}
      {purchaseFor===row.customerId&&purchaseOptions&&<div className="w-full space-y-3 rounded-xl border border-primary-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2"><strong>新增繳費</strong><button type="button" className="min-h-11 px-2 text-earth-600 underline" disabled={purchasing} onClick={()=>{setPurchaseFor(null);setPurchaseOptions(null);}}>取消</button></div>
        {!purchaseOptions.plans.length?<p role="status" className="text-earth-600">目前沒有適用這門課的上架方案，請先設定課程方案。</p>:<>
          <label className="block">選擇方案<select aria-label="繳費方案" className="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3" value={purchasePlanId} onChange={event=>{setPurchasePlanId(event.target.value);setPurchaseSummary({paid:null,valid:false});setPurchaseRequestKey(crypto.randomUUID());}}>{purchaseOptions.plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {plan.points} 堂 · NT$ {plan.price.toLocaleString()}</option>)}</select></label>
          {purchaseOptions.plans.filter(plan=>plan.id===purchasePlanId).map(plan=><form key={plan.id} onSubmit={event=>{
            event.preventDefault();if(!purchaseSummary.valid||purchaseSummary.paid===null)return;
            const data=new FormData(event.currentTarget);
            const number=(key:string)=>Number(data.get(key));
            const textValue=(key:string)=>String(data.get(key)??"");
            setPurchaseError("");
            startPurchase(async()=>{
              const result=await assignCoursePointCard({planId:plan.id,customerId:row.customerId,expiresDate:"2099-12-31",requestKey:purchaseRequestKey,
                musicPurchaseTerms:number("musicPurchaseTerms"),musicValidityDays:number("musicValidityDays"),musicManualBonus:number("musicManualBonus"),musicJoinSessionId:textValue("musicJoinSessionId"),
                expectedListPrice:number("expectedListPrice"),expectedStoreCost:number("expectedStoreCost"),revenueStaffId:"",discountKind:textValue("discountKind"),discountValue:number("discountValue"),
                paymentMethod:textValue("paymentMethod"),transferLastFour:textValue("transferLastFour")});
              if(!result.success){setPurchaseError(result.error??"繳費失敗");return;}
              const refreshed=await loadCourseScheduleCustomerCards(templateId,row.customerId);
              if(!refreshed.success){setPurchaseError("繳費已完成，但學員方案更新失敗；請重試讀取方案");return;}
              setCards(current=>[...current.filter(card=>!card.members.some(member=>member.id===row.customerId)),...refreshed.cards]);
              cardsLoadedRef.current.add(row.customerId);
              const purchased=refreshed.cards.find(card=>card.available>0);
              if(purchased)onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:purchased.id,trialPrice:undefined}:item));
              setPurchaseFor(null);setPurchaseOptions(null);setNotice("已完成繳費並帶入學員方案");
            });
          }} className="space-y-3">
            <MusicAssignmentPayment plan={plan} canDiscount={purchaseOptions.canDiscount} onSummary={setPurchaseSummary}/>
            <button type="submit" className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50" disabled={purchasing||!purchaseSummary.valid}>{purchasing?"處理中…":`確認已收 NT$ ${purchaseSummary.paid?.toLocaleString()??"—"}`}</button>
          </form>)}
        </>}
      </div>}
      {purchaseFor===row.customerId&&purchaseOptions&&purchaseError&&<p role="alert" className="w-full text-red-700">{purchaseError}</p>}
    </div>;})}
    <input aria-label="搜尋排課學員" placeholder={value.length>=capacity?"已滿":ready?"姓名或電話":"學員資料載入中…"} className="min-h-11 w-full rounded-xl border border-earth-200 px-3" value={query} disabled={disabled||!ready||value.length>=capacity} onChange={event=>setQuery(event.target.value)}/>
    {!newCustomer&&matches.length>0&&<div className="max-h-48 overflow-y-auto rounded-lg border border-earth-200">{matches.map(person=><button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left" disabled={disabled||value.length>=capacity} onClick={()=>{const card=!trialMode?available.find(card=>card.members.some(member=>member.id===person.id)):undefined;onChange([...value,{customerId:person.id,cardId:card?.id??"",name:person.name,...(!card&&trialMode?{trialPrice:trial.price}:{})}]);setQuery("");if(!trialMode)void loadCardsFor(person.id);}}>{person.name}<span className="ml-auto text-earth-500">{person.phone.slice(-3)}</span><span className="ml-2">＋</span></button>)}</div>}
    {ready&&query.trim()&&!matches.length&&<p className="text-earth-600">沒有符合的學員</p>}
    {trialMode&&trial.enabled&&value.length<capacity&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled||creating||!ready} onClick={()=>{
      const customerId="trial-draft:"+crypto.randomUUID();
      const name="體驗者 "+(Math.max(0,...value.map(p=>Number(p.name.match(/^體驗者\s*(\d+)$/)?.[1])||0))+1);
      onChange([...value,{customerId,cardId:"",name,trialPrice:trial.price}]);
      setSupplementKey(customerId);setNewCustomer(true);setNewName("");setNewPhone("");setCreateError("");setNotice("");setQuery("");
    }}>＋體驗者</button>}

    {newCustomer&&<div className="grid grid-cols-2 gap-2 rounded-lg border border-earth-200 p-3">
      <label>姓名<input aria-label="新學員姓名" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newName} disabled={creating||disabled} onChange={e=>setNewName(e.target.value)}/></label>
      <label>手機<input aria-label="新學員手機" type="tel" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newPhone} disabled={creating||disabled} onChange={e=>setNewPhone(e.target.value)}/></label>
      <button type="button" className="col-span-2 min-h-11 text-primary-700" disabled={creating||disabled||!newName.trim()||!newPhone.trim()} onClick={()=>startCreate(async()=>{
        setCreateError("");
        try{const result=await createScheduleCustomer({name:newName,phone:newPhone});if(!result.success){setCreateError(result.error??"新增失敗");return;}
        const person=result.customer;setCustomers(rows=>[...rows.filter(row=>row.id!==person.id),person]);
        if(supplementKey){
          if(value.some(row=>row.customerId===person.id&&row.customerId!==supplementKey)){setCreateError("此學員已在名單，請核對同行者");return;}
          onChange(value.map(row=>row.customerId===supplementKey?{...row,customerId:person.id,name:person.name}:row));
        }else if(!value.some(row=>row.customerId===person.id)){const card=!trialMode?available.find(card=>card.members.some(member=>member.id===person.id)):undefined;onChange([...value,{customerId:person.id,name:person.name,cardId:card?.id??"",...(!card&&trialMode?{trialPrice:trial.price}:{})}]);}
        setNotice(person.existing?"此手機已有學員，已帶入原資料":"學員已建檔");setNewCustomer(false);setSupplementKey(null);setNewName("");setNewPhone("");
        }catch{setCreateError("連線失敗，請重試");}
      })}>{creating?"儲存中…":supplementKey?"儲存資料":"建立並加入"}</button>
      {supplementKey&&<button type="button" className="col-span-2 min-h-11 text-earth-600 underline" disabled={creating||disabled} onClick={()=>{setNewCustomer(false);setSupplementKey(null);setNewName("");setNewPhone("");}}>先不填資料</button>}
      {createError&&<p role="alert" className="col-span-2 text-red-700">{createError}</p>}
    </div>}
    {notice&&<p role="status" className="text-primary-700">{notice}</p>}
    {error?.templateId===templateId&&<p role="alert" className="text-red-700">{error.message}<button type="button" className="ml-2 min-h-11 underline" onClick={()=>{reader.invalidate(templateId);setRetry(count=>count+1);}}>重試</button></p>}
  </section>;
}
