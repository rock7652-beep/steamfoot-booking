"use client";

import { SpaCheckoutPanel } from "./checkout-panel";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSpaAvailableProviders } from "@/server/actions/spa-service-staff";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RightSheet } from "@/components/admin/right-sheet";
import { toLocalDateStr } from "@/lib/date-utils";
import { minutesOf, timeOf } from "@/lib/spa-scheduling";
import { createSpaGroupBookingAction, createSpaBookingAction, updateSpaBookingAction, cancelSpaBookingAction, type CreateSpaBookingInput } from "@/server/actions/spa-booking";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";

type Named = { id: string; name: string };
type Treatment = Named & { price: number; serviceMinutes: number; bufferMinutes: number; locationIds: string[] };
type Props = { date: string; bookings: SpaScheduleBooking[]; staff: (Named & {colorCode?:string})[]; customers: (Named & { phone: string })[];
  treatments: Treatment[]; locations: Named[]; canCreate: boolean; canUpdate: boolean;canCheckout:boolean };
const statusNames: Record<string, string> = { PENDING: "待確認", CONFIRMED: "已預約", CANCELLED: "已取消", COMPLETED: "已完成", NO_SHOW: "未到" };
const statusStyles:Record<string,string>={PENDING:"border-amber-300 bg-amber-50 text-amber-950",CONFIRMED:"border-teal-300 bg-teal-50 text-teal-950",COMPLETED:"border-slate-300 bg-slate-100 text-slate-800"};
const inputClass = "mt-1 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";

export function SpaScheduleWorkspace(props: Props) {
  const { date, bookings, staff, customers, treatments, locations, canCreate, canUpdate,canCheckout } = props;
  const router = useRouter();
  const [interval, setIntervalMinutes] = useState<15 | 30>(30);
  const [clock, setClock] = useState<Date | null>(null);
  const [checkout,setCheckout]=useState<SpaScheduleBooking|null>(null);
  const [draft, setDraft] = useState<CreateSpaBookingInput | null>(null);
  const [companions,setCompanions]=useState<CreateSpaBookingInput[]>([]);
  const [groupKey,setGroupKey]=useState(()=>crypto.randomUUID());
  const [editing, setEditing] = useState<SpaScheduleBooking | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [availabilityRevision,setAvailabilityRevision]=useState(0);
  const [providerResult, setProviderResult] = useState<{key:string;people:Named[];locations?:Named[];setupHref?:string|null;setupLabel?:string;error?:string;reason?:string;suggestions?:{startTime:string;endTime:string}[]}>({key:"",people:[]});
  const providerKey = draft && (!editing || ["PENDING", "CONFIRMED"].includes(editing.status)) && draft.treatmentIds.length ? JSON.stringify([draft.bookingDate,draft.startTime,[...draft.treatmentIds].sort(),editing?.id,availabilityRevision]) : "";
  useEffect(()=>{
    if(!providerKey)return;
    let current=true;
    const [requestedDate,startTime,treatmentIds,bookingId]=JSON.parse(providerKey) as [string,string,string[],string?];
    getSpaAvailableProviders({date:requestedDate,startTime,treatmentIds,bookingId:bookingId??undefined}).then(result=>{
      if(!current)return;
      if(!result.success){setProviderResult({key:providerKey,people:[],error:result.error});return;}
      setProviderResult({key:providerKey,people:result.people,reason:result.reason,suggestions:result.suggestions,locations:result.locations,setupHref:result.setupHref,setupLabel:result.setupLabel});
      setDraft(previous=>previous?{...previous,serviceLocationId:result.locations.some(l=>l.id===previous.serviceLocationId)?previous.serviceLocationId:result.locations.length===1?result.locations[0].id:undefined,serviceStaffId:result.people.some(p=>p.id===previous.serviceStaffId)?previous.serviceStaffId:result.people.length===1?result.people[0].id:""}:previous);
    }).catch(()=>{if(current)setProviderResult({key:providerKey,people:[],error:"無法取得可服務人員，請調整時間重試"});});
    return()=>{current=false;};
  },[providerKey]);
  const checkingProviders=!!providerKey&&providerResult.key!==providerKey;
  const queuedConflict=(c:CreateSpaBookingInput)=>{
    if(!draft||c.bookingDate!==draft.bookingDate)return false;
    const duration=(ids:string[])=>treatments.filter(t=>ids.includes(t.id)).reduce((n,t)=>n+t.serviceMinutes+t.bufferMinutes,0);
    return minutesOf(c.startTime)<minutesOf(draft.startTime)+duration(draft.treatmentIds)&&minutesOf(c.startTime)+duration(c.treatmentIds)>minutesOf(draft.startTime);
  };
  const availableProviders=(providerKey&&providerResult.key===providerKey?providerResult.people:[]).filter(p=>!companions.some(c=>c.serviceStaffId===p.id&&queuedConflict(c)));
  const selected = treatments.filter(t => draft?.treatmentIds.includes(t.id));
  const allowed = (providerKey&&providerResult.key===providerKey ? providerResult.locations??[] : []).filter(l=>!companions.some(c=>c.serviceLocationId===l.id&&queuedConflict(c)));
  const effectiveLocation = allowed.some(l=>l.id===draft?.serviceLocationId)?draft?.serviceLocationId : (allowed.length === 1 ? allowed[0].id : "");
  const openNew = (time = "10:00", staffId = staff[0]?.id ?? "") => {
    if (!canCreate) return;
    setCompanions([]);setGroupKey(crypto.randomUUID());setEditing(null); setStep(0); setError("");
    setDraft({ customerId: "", serviceStaffId: staffId, treatmentIds: [], bookingDate: date,
      startTime: time, requestKey: crypto.randomUUID(), notes: "" });
  };
  const openEdit = (booking: SpaScheduleBooking) => {
    setCompanions([]);setEditing(booking); setStep(0); setError("");
    setDraft({ customerId: booking.customerId, serviceStaffId: booking.serviceStaffId,
      serviceLocationId: booking.serviceLocationId ?? undefined, treatmentIds: booking.treatmentIds,
      bookingDate: date, startTime: booking.startTime, requestKey: crypto.randomUUID(), notes: booking.notes });
  };
  const editable = editing ? canUpdate && ["PENDING", "CONFIRMED"].includes(editing.status) : canCreate;
  function submit(cancel = false) {
    if (!draft || pending) return;
    if (!cancel && !effectiveLocation) { setError("請選擇此時段可用的服務位置"); return; }
    if (!cancel && (checkingProviders || !availableProviders.some(p=>p.id===draft.serviceStaffId))) { setError("請選擇此時段可服務的人員"); return; }
    setError("");
    startTransition(async () => {
      try {
        const data = { ...draft, serviceLocationId: effectiveLocation || undefined };
        const result = cancel && editing ? await cancelSpaBookingAction({ bookingId: editing.id, expectedUpdatedAt: editing.updatedAt })
          : editing ? await updateSpaBookingAction({ ...data, bookingId: editing.id, expectedUpdatedAt: editing.updatedAt })
          : companions.length ? await createSpaGroupBookingAction({requestKey:groupKey,customerId:data.customerId,guests:[...companions,data]}) : await createSpaBookingAction(data);
        if (!result.success) { setError(result.error); return; }
        setNotice(cancel ? "預約已取消，時段已釋放" : editing ? "預約已更新" : "預約已建立");
        setDraft(null);setCompanions([]); setEditing(null);
        if (!cancel && data.bookingDate !== date) router.replace(`/dashboard/spa-schedule?date=${data.bookingDate}`);
        else router.refresh();
      } catch { setError("連線失敗，輸入已保留，請重試"); }
    });
  }
  const rowHeight = 44;
  const slots = Array.from({ length: 1440 / interval }, (_, i) => timeOf(i * interval));
  const nowTime = clock ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(clock) : null;
  return <>
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-earth-900">預約排程</h1><p className="mt-1 text-sm text-earth-500">查看人員與服務位置，點選空白時段安排預約</p></div>
      <div className="flex items-center gap-2">
        <input aria-label="排程日期" type="date" value={date} onChange={e => e.target.value && router.push(`/dashboard/spa-schedule?date=${e.target.value}`)} className="rounded-lg border border-earth-200 px-3 py-2" />
        <select aria-label="時間間隔" value={interval} onChange={e => setIntervalMinutes(Number(e.target.value) as 15 | 30)} className="rounded-lg border border-earth-200 px-3 py-2"><option value={15}>15 分鐘</option><option value={30}>30 分鐘</option></select>
        {canCreate && <button onClick={() => openNew()} className="rounded-lg bg-earth-800 px-4 py-2 text-white">新增預約</button>}
      </div>
    </header>
    {notice && <p role="status" className="mb-3 rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    {(!treatments.length||!locations.length)&&<div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">{!treatments.length&&<Link className="mr-4 underline" href="/dashboard/plans">尚無啟用服務 → 前往方案管理</Link>}{!locations.length&&<Link className="underline" href="/dashboard/spa-resources">尚無啟用位置 → 設定服務位置</Link>}</div>}
    {!staff.length ? <p className="rounded-xl border p-8">尚無可安排的服務人員。<Link className="ml-2 underline" href="/dashboard/spa-staff">新增人員與排班 →</Link></p> :
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-earth-200 bg-white" ref={node => { if (node && node.dataset.positioned !== "yes") { node.scrollTop = 9 * 60 / interval * rowHeight; node.dataset.positioned = "yes"; } }}>
        <div style={{ minWidth: Math.max(680, staff.length * 210 + 70) }}>
          <div className="sticky top-0 z-20 grid border-b bg-earth-50" style={{ gridTemplateColumns: `70px repeat(${staff.length}, 1fr)` }}><div className="p-3 text-xs">時間</div>{staff.map(s => <div key={s.id} className="border-l p-3 font-semibold"><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{backgroundColor:s.colorCode??"#6366f1"}}/>{s.name}</div>)}</div>
          <div className="relative grid" style={{ gridTemplateColumns: `70px repeat(${staff.length}, 1fr)` }}>
            <div>{slots.map(time => <div key={time} style={{ height: rowHeight }} className="border-b px-2 py-2 text-xs text-earth-500">{time}</div>)}</div>
            {staff.map(s => <div key={s.id} className="relative border-l">
              {slots.map(time => <button key={time} disabled={!canCreate} aria-label={`${s.name} ${time} 新增預約`} onClick={() => openNew(time, s.id)} style={{ height: rowHeight }} className="block w-full border-b border-earth-100 text-left hover:bg-earth-50 focus:bg-earth-100" />)}
              {bookings.filter(b => b.serviceStaffId === s.id && b.status !== "CANCELLED" && b.status !== "NO_SHOW").map(b => <button key={b.id} title={`${customers.find(c=>c.id===b.customerId)?.name??"顧客"} · ${b.serviceName} · ${b.startTime}–${b.endTime} · ${locations.find(l=>l.id===b.serviceLocationId)?.name??"待安排位置"} · ${statusNames[b.status]}`} onClick={() => openEdit(b)} style={{ top: minutesOf(b.startTime) / interval * rowHeight, height: Math.max(28, (minutesOf(b.endTime) - minutesOf(b.startTime)) / interval * rowHeight - 2) }} className={`absolute inset-x-1 overflow-hidden rounded-lg border p-2 text-left text-xs hover:brightness-95 ${statusStyles[b.status]??statusStyles.CONFIRMED}`}>
                <div className="flex justify-between gap-1 font-semibold"><span>{customers.find(c => c.id === b.customerId)?.name ?? "顧客"}</span><span>{b.partyGroupId?`同行 ${b.guestIndex} · `:""}{statusNames[b.status]}</span></div><div>{b.startTime}–{b.endTime} · {b.serviceName}</div><div>{locations.find(l => l.id === b.serviceLocationId)?.name ?? (b.serviceLocationId ? "已停用位置" : "待安排位置")}</div>
              </button>)}
            </div>)}
            {clock && toLocalDateStr(clock) === date && nowTime && <div aria-label={`現在時間 ${nowTime}`} className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: minutesOf(nowTime) / interval * rowHeight }}><span className="bg-red-500 px-1 text-xs text-white">{nowTime}</span></div>}
          </div>
        </div>
      </div>}
    <p className="mt-2 text-xs text-earth-500">黃：待確認 · 綠：已預約 · 灰：已完成。短時段點開即可查看完整內容。</p>
    <details className="mt-4 rounded-xl border border-earth-200 bg-white p-4"><summary className="cursor-pointer">當日預約紀錄（{bookings.length}）</summary>
      {bookings.map(b => <button key={b.id} onClick={() => openEdit(b)} className="flex w-full justify-between gap-3 border-b py-3 text-left text-sm"><span>{b.startTime}–{b.endTime} {customers.find(c => c.id === b.customerId)?.name ?? "顧客"} · {b.serviceName}<small className="block text-earth-500">{staff.find(p=>p.id===b.serviceStaffId)?.name??"服務人員"} · {locations.find(l=>l.id===b.serviceLocationId)?.name??"待安排位置"}</small></span><span>{statusNames[b.status]}</span></button>)}
    </details>
    {checkout&&<SpaCheckoutPanel key={checkout.id} booking={checkout} groupBookings={bookings.filter(b=>!!checkout.partyGroupId&&b.partyGroupId===checkout.partyGroupId)} customerName={customers.find(c=>c.id===checkout.customerId)?.name??"顧客"} onClose={()=>setCheckout(null)} onCompleted={()=>{setCheckout(null);setNotice("已完成服務並記錄收款。");router.refresh();}}/>}
    {draft && <RightSheet open onClose={() => { if (!pending) setDraft(null); }} width={520} labelledById="spa-panel-title">
      <header className="flex items-center justify-between border-b p-5"><h2 id="spa-panel-title" className="text-xl font-bold">{editing ? "預約詳情" : "新增預約"}</h2><button disabled={pending} onClick={() => setDraft(null)} aria-label="關閉預約面板">✕</button></header>
      <div className="flex-1 overflow-y-auto p-5">
        {editing && <p className="mb-4 text-sm">{statusNames[editing.status]}{!editing.serviceLocationId && " · 待安排位置"}</p>}
        {editing?.receipt&&<div className="mb-4 rounded-lg bg-green-50 p-3 text-sm">{editing.receipt.refunded?"已退款／退回堂數":"已結帳"} · {({CASH:"現金",CARD:"刷卡",STORED_VALUE:"儲值扣款",ENTITLEMENT:"方案扣次"} as Record<string,string>)[editing.receipt.paymentMethod]??editing.receipt.paymentMethod} · {editing.receipt.paymentMethod==="ENTITLEMENT"?`${editing.receipt.uses} 次`:`NT$${editing.receipt.amount.toLocaleString()}`} {editing.receipt.balanceAfter!=null&&<p>{editing.receipt.paymentMethod==="ENTITLEMENT"?`方案剩餘 ${editing.receipt.balanceAfter} 次（含已保留）`:`扣款後餘額 NT$${editing.receipt.balanceAfter.toLocaleString()}`}</p>}<p>結帳時間：{new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",dateStyle:"short",timeStyle:"short"}).format(new Date(editing.receipt.paidAt))}</p><p className="break-all text-xs">結帳編號：{editing.receipt.id}</p></div>}
        {!editing&&companions.length>0&&<section className="mb-3 rounded-lg bg-earth-50 p-3 text-sm"><strong>正在安排第 {companions.length+1} 位（最多 3 位）</strong>{companions.map((c,i)=><p key={c.requestKey}>第 {i+1} 位 · {c.treatmentIds.map(id=>treatments.find(t=>t.id===id)?.name).join("＋")} · {c.startTime} · {staff.find(s=>s.id===c.serviceStaffId)?.name} <button disabled={pending} onClick={()=>setCompanions(prev=>prev.filter((_,j)=>j!==i))} className="underline">移除</button></p>)}<p>整組一起送出，有衝突時全組保留，不會建立半套預約。</p></section>}
        <nav aria-label="預約步驟" className="mb-5 grid grid-cols-4 gap-1">{["服務", "時間", "顧客", "確認"].map((label, i) => <button key={label} onClick={() => setStep(i)} className={`rounded-lg py-2 text-sm ${i === step ? "bg-earth-800 text-white" : "bg-earth-50"}`}>{i + 1} {label}</button>)}</nav>
        <fieldset disabled={pending || !editable}>
          {step === 0 && <div className="space-y-2"><h3 className="font-semibold">選擇服務</h3>{!treatments.length&&<Link href="/dashboard/plans" className="block rounded-lg bg-amber-50 p-3 underline">尚無啟用服務，前往方案管理 →</Link>}{treatments.map(t => <label key={t.id} className="flex items-center gap-3 rounded-lg border border-earth-200 p-3"><input type="checkbox" checked={draft.treatmentIds.includes(t.id)} onChange={e => setDraft({ ...draft, serviceLocationId: undefined, treatmentIds: e.target.checked ? [...draft.treatmentIds, t.id] : draft.treatmentIds.filter(id => id !== t.id) })} /><span className="flex-1">{t.name}<small className="block text-earth-500">{t.serviceMinutes} 分鐘{t.bufferMinutes > 0 && `＋緩衝 ${t.bufferMinutes} 分鐘`}</small></span><span>${t.price.toLocaleString()}</span></label>)}</div>}
          {step === 1 && <div className="space-y-4">
            <label className="block">日期<input type="date" disabled={companions.length>0} className={inputClass} value={draft.bookingDate} onChange={e => setDraft({ ...draft, bookingDate: e.target.value })} /></label>
            <label className="block">開始時間<input type="time" className={inputClass} value={draft.startTime} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
            {!checkingProviders&&providerResult.key===providerKey&&!!providerResult.suggestions?.length&&<div className="rounded-lg bg-earth-50 p-3"><p className="mb-2 text-sm">當日接下來可預約的時段（人員與位置皆有空檔）</p><div className="flex flex-wrap gap-2">{providerResult.suggestions.map(s=><button key={s.startTime} type="button" className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm" onClick={()=>setDraft({...draft,startTime:s.startTime,serviceStaffId:""})}>{s.startTime}–{s.endTime}</button>)}</div></div>}
            <label className="block">服務人員<select disabled={checkingProviders} className={inputClass} value={availableProviders.some(p=>p.id===draft.serviceStaffId)?draft.serviceStaffId:""} onChange={e => setDraft({ ...draft, serviceStaffId: e.target.value })}><option value="">{checkingProviders?"查詢中…":"請選擇可服務人員"}</option>{availableProviders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            {!checkingProviders&&<p className="text-sm text-earth-500">{!providerKey?"請先選擇服務。":providerResult.error??(availableProviders.length?"僅顯示可提供所選服務、有排班且人員與位置皆有空檔的選項。":providerResult.reason||"此時段無法安排，請選擇其他時間。")}</p>}

            {!checkingProviders&&providerResult.key===providerKey&&providerResult.setupHref&&<Link href={providerResult.setupHref} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-earth-200 px-3 py-2 text-sm">{providerResult.setupLabel} ↗</Link>}
            <button type="button" disabled={checkingProviders} className="text-sm underline disabled:opacity-50" onClick={()=>setAvailabilityRevision(v=>v+1)}>重新檢查空檔與設定</button>
            <label className="block">服務位置<select disabled={checkingProviders} className={inputClass} value={effectiveLocation} onChange={e => setDraft({ ...draft, serviceLocationId: e.target.value || undefined })}><option value="">請選擇</option>{allowed.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            {!allowed.length && <p className="text-sm text-amber-800">此時段沒有可用位置，請調整時間或檢查位置設定。</p>}
            {allowed.length === 1 && <p className="text-sm text-earth-500">已自動帶入唯一可用位置。送出時會再次確認，避免同時預約衝突。</p>}
          </div>}
          {step === 2 && <div className="space-y-4"><label className="block">主要聯絡人<select disabled={companions.length>0||!!editing?.partyGroupId} className={inputClass} value={draft.customerId} onChange={e => setDraft({ ...draft, customerId: e.target.value })}><option value="">請選擇顧客</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label><label className="block">備註<textarea className={inputClass} maxLength={500} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label></div>}
          {step === 3 && <div className="space-y-3 rounded-xl bg-earth-50 p-4"><p>{selected.map(t => t.name).join("＋") || "尚未選擇服務"}</p><p>{draft.bookingDate} {draft.startTime} · 共 {selected.reduce((n, t) => n + t.serviceMinutes + t.bufferMinutes, 0)} 分鐘</p><p>{staff.find(s => s.id === draft.serviceStaffId)?.name} · {locations.find(l => l.id === effectiveLocation)?.name ?? "尚未選擇位置"}</p><p>{customers.find(c => c.id === draft.customerId)?.name ?? "尚未選擇顧客"}</p><p className="font-bold">NT${selected.reduce((n, t) => n + t.price, 0).toLocaleString()}</p><p className="text-sm">{draft.notes}</p></div>}
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t p-5">
        {editing&&editable&&canCheckout&&<button disabled={pending} className="rounded-lg bg-teal-800 px-3 py-2 text-white" onClick={()=>{setCheckout(editing);setDraft(null);}}>完成並結帳</button>}
        {editing && editable && <button disabled={pending} onClick={() => { if (window.confirm("確認取消這筆預約？取消後將釋放人員與服務位置時段。")) submit(true); }} className="mr-auto rounded-lg border border-red-200 px-3 py-2 text-red-700">取消預約</button>}
        {!editing&&step===3&&companions.length<2&&<button disabled={pending||!draft.customerId||!draft.treatmentIds.length||!effectiveLocation||!availableProviders.some(p=>p.id===draft.serviceStaffId)} className="rounded-lg border px-3 py-2" onClick={()=>{setCompanions(prev=>[...prev,{...draft,serviceLocationId:effectiveLocation}]);setDraft({...draft,treatmentIds:[],serviceStaffId:"",serviceLocationId:undefined,requestKey:crypto.randomUUID(),notes:""});setStep(0);setError("");}}>＋加入下一位同行</button>}
        {step > 0 && <button disabled={pending} onClick={() => setStep(step - 1)} className="rounded-lg border px-3 py-2">上一步</button>}
        {step < 3 ? <button onClick={() => setStep(step + 1)} className="rounded-lg bg-earth-800 px-4 py-2 text-white">下一步</button>
          : editable && <button disabled={pending} onClick={() => submit()} className="rounded-lg bg-earth-800 px-4 py-2 text-white disabled:opacity-50">{pending ? "處理中…" : editing ? "儲存修改" : companions.length?`確認 ${companions.length+1} 位預約`:"確認預約"}</button>}
      </footer>
    </RightSheet>}
  </>;
}
