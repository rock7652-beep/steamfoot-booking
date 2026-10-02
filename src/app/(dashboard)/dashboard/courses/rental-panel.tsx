"use client";
import { useEffect,useRef,useState,useTransition,useCallback,useId } from "react";
import { useRouter } from "next/navigation";
import { createRentalCustomer,saveCourseRental,getCourseRental,cancelCourseRental,saveRentalPayment,listRoomRentals } from "@/server/actions/course-rental";
import { rentalPrice,type RentalDetail } from "@/lib/course-rental";
import { formatTWDateTime,toLocalDateStr } from "@/lib/date-utils";
const field="min-h-11 min-w-0 max-w-full w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";
const button="inline-flex items-center justify-center min-h-11 shrink-0 rounded-lg px-3 text-sm disabled:opacity-50";
export type RentalPermissions={customerRead:boolean;customerCreate:boolean;collect:boolean;correct:boolean;edit:boolean};
export type RentalRoom={id:string;name:string;isActive:boolean;rentalEnabled?:boolean;rentalHourlyRate?:number};
export type RentalCustomer={id:string;name:string;phone:string};
const NO_CUSTOMERS:RentalCustomer[]=[];
type Seed={date?:string;time?:string;roomId?:string;durationMinutes?:number};
export function RentalPanel({id,rooms,seed,permissions,customers=NO_CUSTOMERS,onDone,onGuard}:{id?:string;rooms:RentalRoom[];seed:Seed;permissions:RentalPermissions;customers?:RentalCustomer[];onDone?:()=>void;onGuard?:(pending:boolean,dirty:boolean)=>void}) {
  const formId=useId();
  const [paymentMethod,setPaymentMethod]=useState("");
  const [paidAmount,setPaidAmount]=useState<number|null>(null);
  const submitLock=useRef(false);
  const [dirty,setDirty]=useState(false);
  const [collectAfterSave,setCollectAfterSave]=useState(false);
  const router=useRouter();const [record,setRecord]=useState<RentalDetail|null>(null);const [mode,setMode]=useState<"edit"|"detail"|"payment">(id?"detail":"edit");
  const [error,setError]=useState("");const [pending,start]=useTransition();const [loaded,setLoaded]=useState(!id);
  const [roomId,setRoomId]=useState(seed.roomId??rooms.find(r=>r.rentalEnabled&&r.isActive)?.id??"");
  const [duration,setDuration]=useState(seed.durationMinutes??60);const [amount,setAmount]=useState(rentalPrice(rooms.find(r=>r.id===roomId)?.rentalHourlyRate??0,duration));
  const [query,setQuery]=useState("");const [customer,setCustomer]=useState<{id:string;name:string;phone:string}|null>(null);
  const [newCustomer,setNewCustomer]=useState(false);const [customerNotice,setCustomerNotice]=useState("");const [voidOnly,setVoidOnly]=useState(false);
  const [requestKey]=useState(()=>crypto.randomUUID());const paymentKey=useRef(crypto.randomUUID());
  useEffect(()=>{onGuard?.(pending,dirty);return()=>onGuard?.(false,false);},[pending,dirty,onGuard]);
  function apply(r:RentalDetail){setDirty(false);setRecord(r);setRoomId(r.roomId);setDuration((Date.parse(r.endsAt)-Date.parse(r.startsAt))/60000);setAmount(r.amount);if(r.customerId)setCustomer({id:r.customerId,name:r.customerName,phone:r.customerPhone});setLoaded(true);}
  useEffect(()=>{if(!id)return;let active=true;getCourseRental(id).then(r=>{if(active)apply(r);}).catch(()=>{if(active){setLoaded(true);setError("租借讀取失敗，請關閉後重試");}});return()=>{active=false;};},[id]);
  const normalizedQuery=query.trim().toLocaleLowerCase();
  const phoneQuery=normalizedQuery.replace(/[\s()+-]/g,"");
  const matchingCustomers=permissions.customerRead&&normalizedQuery?customers.filter(c=>c.name.toLocaleLowerCase().includes(normalizedQuery)||(phoneQuery&&c.phone.replace(/[\s()+-]/g,"").includes(phoneQuery))):[];
  const matches=matchingCustomers.slice(0,10);

  async function reload(rentalId:string){apply(await getCourseRental(rentalId));router.refresh();}
  if(!loaded)return <p className="p-4">讀取租借…</p>;
  const room=rooms.find(r=>r.id===roomId);
  return <div data-course-entry className="flex flex-1 min-h-0 w-full min-w-0 flex-col gap-3 text-sm">
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {mode==="detail"&&record&&<div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="text-base text-primary-900">{record.customerName}</strong><a className={`${button} text-primary-700`} href={`tel:${record.customerPhone}`}>{record.customerPhone}</a></div><div className="ml-auto flex items-center gap-1"><span className="whitespace-nowrap tabular-nums">{record.payment?`已收 $${record.payment.amount.toLocaleString()}`:`應收 $${record.amount.toLocaleString()}・未收`}</span>{(record.payment?permissions.correct:permissions.collect)&&(!record.cancelledAt||record.payment)&&<button type="button" className={`${button} text-primary-700`} aria-label={record.payment?"更正租借收款":"收取租借費用"} onClick={()=>{paymentKey.current=crypto.randomUUID();setVoidOnly(!!record.cancelledAt);setMode("payment");setError("");}}>{record.payment?"✎":"收款"}</button>}</div></div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[420px]:grid-cols-[1fr_auto]"><div><dt className="text-xs text-earth-500">時段</dt><dd className="mt-1 tabular-nums">{formatTWDateTime(new Date(record.startsAt))}–{formatTWDateTime(new Date(record.endsAt)).slice(11)}</dd></div><div><dt className="text-xs text-earth-500">空間</dt><dd className="mt-1">{room?.name??"未指定"}</dd></div></dl>
      {record.payment&&record.payment.amount!==record.amount&&<p className="text-amber-700">應收 ${record.amount} · 已收 ${record.payment.amount} · 差額 ${record.amount-record.payment.amount}</p>}
      {record.cancelledAt&&<p className="text-earth-600">已取消 · 空間已釋出{record.payment?"，原收款保留，請核對退款或作廢。":""}</p>}
      {record.note&&<p className="whitespace-pre-wrap text-earth-600">{record.note}</p>}
      {permissions.edit&&!record.cancelledAt&&<div className="flex justify-end gap-2 border-t border-earth-100 pt-2"><button className={button} onClick={()=>setMode("edit")}>編輯租借</button><button className={`${button} text-red-700`} disabled={pending} onClick={()=>{if(!window.confirm(record.payment?"取消租借會釋出空間，原收款仍保留，之後請核對退款或作廢。確認取消？":"確認取消租借並釋出空間？"))return;start(async()=>{setError("");const r=await cancelCourseRental({id:record.id,revision:record.revision});if(!r.success){setError(r.error??"取消失敗");return;}await reload(record.id);});}}>取消租借</button></div>}
    </div>}
    {mode==="edit"&&<form id={formId} className="flex min-h-0 flex-1 flex-col" onChangeCapture={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();if(submitLock.current)return;submitLock.current=true;const f=new FormData(e.currentTarget);start(async()=>{setError("");try{const result=await saveCourseRental({id:record?.id,revision:record?.revision,requestKey,roomId,customerId:customer?.id??null,customerName:customer?.name??String(f.get("name")),customerPhone:customer?.phone??String(f.get("phone")),date:String(f.get("date")),time:String(f.get("time")),durationMinutes:duration,amount,note:String(f.get("note")),...(!record&&collectAfterSave?{payment:{amount:paidAmount??amount,paymentMethod}}:{})});if(!result.success){setError(result.error??"儲存失敗");return;}await reload(result.id);paymentKey.current=crypto.randomUUID();setCollectAfterSave(false);setMode("detail");}catch{setError("連線失敗，輸入已保留，請重試");}finally{submitLock.current=false;}});}}>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-x-hidden overflow-y-auto overscroll-contain pb-3 [&>label]:min-w-0 [&>label]:space-y-1">
      {permissions.customerRead&&<div className="col-span-2"><div className="flex items-center gap-2"><input className={field} aria-label="搜尋租借人" placeholder="搜尋姓名或電話" value={query} onChange={e=>{setQuery(e.target.value);}}/>{permissions.customerCreate&&<button type="button" className={`${button} shrink-0 text-primary-700`} onClick={()=>setNewCustomer(v=>!v)}>＋新顧客</button>}</div>{query&&matches.length>0&&<ul className="max-h-40 overflow-y-auto divide-y divide-earth-100">{matches.map(c=><li key={c.id}><button type="button" className={`${button} flex w-full justify-between text-left`} onClick={()=>{setDirty(true);setCustomer(c);setQuery("");setNewCustomer(false);}}><span>{c.name}</span><span>{c.phone}</span></button></li>)}</ul>}{normalizedQuery&&matches.length===0&&<p role="status" className="py-2 text-earth-500">沒有符合的顧客，可直接填寫或新增。</p>}{matchingCustomers.length>10&&<p className="text-xs text-earth-500">符合 {matchingCustomers.length} 位，請輸入更多姓名或電話。</p>}</div>}
      {newCustomer&&<div className="col-span-2 grid grid-cols-2 gap-2 border-b border-earth-100 pb-2"><label>姓名<input className={field} name="newName" maxLength={80}/></label><label>電話<input className={field} name="newPhone" maxLength={30}/></label><button type="button" className={`${button} col-span-2 justify-self-end text-primary-700`} disabled={pending} onClick={e=>{const f=new FormData(e.currentTarget.form!);start(async()=>{const r=await createRentalCustomer({name:String(f.get("newName")),phone:String(f.get("newPhone"))});if(!r.success){setError(r.error??"新增失敗");return;}setCustomer(r.customer);setNewCustomer(false);setCustomerNotice(r.customer.existing?"此電話已有顧客，已帶入既有資料":"已加入顧客管理");});}}>建立並帶入</button></div>}
      {customerNotice&&<p className="col-span-2 text-primary-700">{customerNotice}</p>}
      {customer?<div className="col-span-2 flex items-center gap-2"><strong>{customer.name}</strong><span>{customer.phone}</span><button type="button" className={button} onClick={()=>{setDirty(true);setCustomer(null);}}>更換</button></div>:<><label>租借人<input className={field} name="name" required maxLength={80} defaultValue={record?.customerName}/></label><label>電話<input className={field} name="phone" required maxLength={30} defaultValue={record?.customerPhone}/></label></>}
      <label>日期<input className={field} type="date" name="date" required defaultValue={record?toLocalDateStr(new Date(record.startsAt)):seed.date}/></label><label>時間<input className={field} type="time" step={1800} name="time" required defaultValue={record?formatTWDateTime(new Date(record.startsAt)).slice(11):seed.time??"18:00"}/></label>
      <label>空間<select className={field} required value={roomId} onChange={e=>{setRoomId(e.target.value);setAmount(rentalPrice(rooms.find(r=>r.id===e.target.value)?.rentalHourlyRate??0,duration));}}><option value="">選擇空間</option>{rooms.filter(r=>r.isActive&&r.rentalEnabled).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>時長（分鐘）<input className={field} type="number" min={30} max={720} step={30} value={duration} onChange={e=>{const v=Number(e.target.value);setDuration(v);setAmount(rentalPrice(room?.rentalHourlyRate??0,v));}} required/></label>
      <label className="col-span-2">應收（元）<input className={field} type="number" min={0} max={1000000} value={amount} onChange={e=>setAmount(Number(e.target.value))} required/></label><label className="col-span-2">備註<textarea className={`${field} h-16 min-h-16 resize-none`} name="note" rows={2} maxLength={1000} defaultValue={record?.note}/></label>
      {!rooms.some(r=>r.isActive&&r.rentalEnabled)&&<p className="col-span-2 text-amber-700">請先到空間管理開啟租借並設定費用。</p>}
      {!record&&permissions.collect&&<label className="col-span-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={collectAfterSave} onChange={e=>setCollectAfterSave(e.target.checked)}/>先收款</label>}
      {!record&&collectAfterSave&&<><label>實收（元）<input className={field} aria-label="租借實收金額" type="number" min={0} max={1000000} value={paidAmount??amount} onChange={e=>setPaidAmount(Number(e.target.value))} required/></label><label>付款方式<select className={field} aria-label="租借付款方式" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} required><option value="">請選擇</option><option value="CASH">現金</option><option value="OTHER">轉帳／其他</option></select></label></>}
      </div><footer className="flex shrink-0 justify-end gap-2 border-t border-earth-100 bg-white pt-2">{record&&<button type="button" className={button} disabled={pending} onClick={()=>{if(dirty&&!window.confirm("放棄未儲存修改？"))return;setDirty(false);setMode("detail");}}>返回</button>}<button className={`${button} bg-primary-700 text-white`} disabled={pending||!room?.rentalEnabled}>{pending?"儲存中…":collectAfterSave?"儲存並收款":"儲存租借"}</button></footer>
    </form>}
    {mode==="payment"&&record&&<form id={formId} className="flex min-h-0 flex-1 flex-col" onChangeCapture={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();if(submitLock.current)return;submitLock.current=true;const f=new FormData(e.currentTarget);start(async()=>{setError("");try{const r=await saveRentalPayment({rentalId:record.id,revision:record.revision,requestKey:paymentKey.current,originalId:record.payment?.id??null,voidOnly,amount:Number(f.get("paymentAmount")),paymentMethod:String(f.get("method")),reason:String(f.get("reason")??"")});if(!r.success){setError(r.error??"收款失敗");return;}await reload(record.id);setMode("detail");}catch{setError("連線失敗，收款輸入已保留，請重試");}finally{submitLock.current=false;}});}}>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto overscroll-contain pb-3 [&>label]:min-w-0 [&>label]:space-y-1">
      <p className="col-span-2 text-primary-900">{record.customerName} · {record.payment?"更正收款":"租借收款"} · 其他收入</p>
      {record.payment&&<label className="col-span-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={voidOnly} disabled={!!record.cancelledAt} onChange={e=>setVoidOnly(e.target.checked)}/>作廢原收款</label>}
      <label>金額（元）<input className={field} name="paymentAmount" type="number" min={0} max={1000000} defaultValue={record.payment?.amount??record.amount} readOnly={voidOnly} required/></label><label>付款方式<select className={field} name="method" defaultValue={record.payment?.paymentMethod??""} required><option value="">請選擇</option><option value="CASH">現金</option><option value="OTHER">轉帳／其他</option></select></label>
      {record.payment&&<label className="col-span-2">更正原因<input className={field} name="reason" required maxLength={500}/></label>}
      {voidOnly&&<p className="col-span-2 text-earth-600">作廢會記錄沖銷；實際退款請另外確認。</p>}
      </div><footer className="flex shrink-0 justify-end gap-2 border-t border-earth-100 bg-white pt-2"><button type="button" className={button} disabled={pending} onClick={()=>{if(dirty&&!window.confirm("放棄未儲存收款修改？"))return;setDirty(false);setMode("detail");}}>返回</button><button className={`${button} bg-primary-700 text-white`} disabled={pending}>{voidOnly?"確認作廢":"確認收款"}</button></footer>
    </form>}
    {onDone&&<button className={button} disabled={pending} onClick={onDone}>完成</button>}
  </div>;
}

export function RentalHistory({roomId,rooms,permissions,customers=NO_CUSTOMERS,onGuard}:{roomId:string;rooms:RentalRoom[];permissions:RentalPermissions;customers?:RentalCustomer[];onGuard?:(pending:boolean,dirty:boolean)=>void}) {
 const guard=useRef({pending:false,dirty:false});const updateGuard=useCallback((pending:boolean,dirty:boolean)=>{guard.current={pending,dirty};onGuard?.(pending,dirty);},[onGuard]);
 const [rows,setRows]=useState<{id:string;name:string;startsAt:string;cancelled:boolean;paid:number|null}[]>([]);const [page,setPage]=useState(1);const [more,setMore]=useState(false);const [selected,setSelected]=useState<string|null>(null);const [error,setError]=useState("");
 useEffect(()=>{let active=true;listRoomRentals(roomId,page).then(r=>{if(active){setRows(r.rows);setMore(r.hasMore);}}).catch(()=>{if(active)setError("租借紀錄讀取失敗");});return()=>{active=false;};},[roomId,page,selected]);
 if(selected)return <><button className={button} onClick={()=>{if(guard.current.pending)return;if(guard.current.dirty&&!window.confirm("放棄未儲存修改？"))return;setSelected(null);}}>← 租借紀錄</button><RentalPanel key={selected} id={selected} rooms={rooms} customers={customers} permissions={permissions} seed={{}} onGuard={updateGuard}/></>;
 return <div>{error&&<p role="alert">{error}</p>}{rows.length===0?<p>尚無租借紀錄</p>:rows.map(r=><button key={r.id} className={`${button} flex w-full justify-between border-b border-earth-100 text-left`} onClick={()=>setSelected(r.id)}><span>{formatTWDateTime(new Date(r.startsAt))} · {r.name}</span><span>{r.cancelled?"已取消 · ":""}{r.paid===null?"未收":`已收 $${r.paid}`}</span></button>)}<div className="flex justify-end gap-2"><button className={button} disabled={page===1} onClick={()=>setPage(p=>p-1)}>上一頁</button><button className={button} disabled={!more} onClick={()=>setPage(p=>p+1)}>下一頁</button></div></div>;
}
