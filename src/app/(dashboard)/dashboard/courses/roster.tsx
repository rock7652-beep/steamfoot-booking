"use client";
import { CollectTrialModal } from "../bookings/collect-trial-modal";
import { CorrectTrialCollectionModal } from "../bookings/correct-trial-collection-modal";
import { createCourseTrial, collectCourseTrial, voidCourseTrialPayment } from "@/server/actions/course-trial";
import { useState, useTransition, useEffect } from "react";
import { formatTWDateTime } from "@/lib/date-utils";
import { useRouter } from "next/navigation";
import {
  updateCourseRosterBatch,
  loadCourseSessionDetail,
  createCourseBooking,
  updateCourseBookingStatus,
  cancelCourseSession,
} from "@/server/actions/course-members";
import type { CourseCardView } from "./member-workspace";
import type { getCourseRoster } from "@/server/queries/course-members";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseRoster({
  sessionId,
  capacity,
  canCreate,
  canEdit,
  allowTrialActions = true,
  compactOnly = false,
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
  allowTrialActions?: boolean;
  compactOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0);
  const [batchTarget,setBatchTarget]=useState<"CHECKED_IN"|"ATTENDED"|"NO_SHOW"|"RESERVED">("CHECKED_IN");
  const [showCancelled,setShowCancelled]=useState(false);
  const [rosterQuery,setRosterQuery]=useState("");
  const [loaded, setLoaded] = useState(false);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof getCourseRoster>>
  >([]);
  const [cards, setCards] = useState<CourseCardView[]>([]);
  const [session, setSession] = useState<{ startsAt: string; pointCost: number } | null>(null);
  const [trial, setTrial] = useState<Extract<Awaited<ReturnType<typeof loadCourseSessionDetail>>,{success:true}>["data"]["trial"] | null>(null);
  const [paymentBooking, setPaymentBooking] = useState<string | null>(null);
  const [correctPayment, setCorrectPayment] = useState(false);
  const [cardId, setCardId] = useState("");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  async function load() {
    const result = await loadCourseSessionDetail(sessionId);
    if (result.success) {
      setSession(result.data.session);
      setTrial(result.data.trial);
      setRoster(result.data.roster);
      setCards(result.data.cards);
      setLoaded(true);
    } else setMessage(result.error);
  }
  useEffect(() => {
    let active = true;
    loadCourseSessionDetail(sessionId).then((result) => {
      if (!active) return;
      if (result.success) {
        setSession(result.data.session);
      setTrial(result.data.trial);
        setRoster(result.data.roster);
        setCards(result.data.cards);
        setLoaded(true);
        setRequestKey(crypto.randomUUID());
      } else setMessage(result.error);
    }).catch(() => active && setMessage("讀取失敗，請重試"));
    return () => { active = false; };
  }, [sessionId]);
  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          await load();
          router.refresh();
          return;
        }
        setMessage("已完成");
        setSelected([]);
        setRequestKey(crypto.randomUUID());
        await load();
        router.refresh();
      } catch {
        setMessage("連線中斷，請重試");
      }
    });
  }
  const card = cards.find((c) => c.id === cardId);
  const payBooking = roster.find(b=>b.id===paymentBooking);
  const receipt = payBooking?.trialPayments.find(p=>p.status==="SUCCESS");
  const paymentSettings = trial ? {allowEdit:trial.settings.trialAllowPriceEdit,defaultPrice:trial.settings.trialDefaultPrice,minPrice:trial.settings.trialMinPrice,maxPrice:trial.settings.trialMaxPrice} : null;
  const activeRows=roster.filter(b=>b.status!=="CANCELLED");
  const cancelledRows=roster.filter(b=>b.status==="CANCELLED");
  const chosen=activeRows.filter(b=>selected.includes(b.id));
  const sourceRows=showCancelled?cancelledRows:activeRows;
  const normalizedQuery=rosterQuery.trim().toLocaleLowerCase();
  const rows=sourceRows.filter(b=>!normalizedQuery || b.customerName.toLocaleLowerCase().includes(normalizedQuery) || (b.phone ?? "").includes(rosterQuery.replace(/\D/g,"")));
  const currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/20)-1));
  const displayedRows=rows.slice(currentPage*20,currentPage*20+20);
  const count = roster.filter((b) => b.status !== "CANCELLED").length;
  const statusLabel=(b:(typeof roster)[number])=> b.bookingKind === "TRIAL"
    ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedInAt?"已報到":"待點名"}[b.status] ?? b.status)
    : b.status === "ATTENDED"
      ? "已出席"
      : b.status === "CANCELLED"
        ? "已取消"
        : b.status === "NO_SHOW"
          ? "未到"
          : b.checkedInAt ? "已報到" : "待點名";
  if (!loaded)
    return (
      <div className="mt-2">
        <button
          className={button}
          disabled={pending}
          onClick={() => {
            setRequestKey(crypto.randomUUID());
            start(async () => {
              try {
                await load();
              } catch {
                setMessage("讀取失敗，請重試");
              }
            });
          }}
        >
          查看名單／預約／點名
        </button>
        {message && <p role="alert">{message}</p>}
      </div>
    );
  return (
    <section className="mt-3 space-y-3 border-t pt-3">
      <p className="font-medium">
        已預約 {count}／{capacity} · 未點名{" "}
        {roster.filter((b) => b.status === "RESERVED").length}
      </p>
      {message && <p role="status">{message}</p>}
      {canEdit && !showCancelled && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label="全選全班學員" checked={activeRows.length>0&&chosen.length===activeRows.length} disabled={pending||!activeRows.length} onChange={e=>setSelected(e.target.checked?activeRows.map(b=>b.id):[])}/>全選全班</label>
        <span className="text-sm">已選 {chosen.length} 人</span>
        <select aria-label="批次點名狀態" className={button} value={batchTarget} disabled={pending} onChange={e=>setBatchTarget(e.target.value as typeof batchTarget)}><option value="CHECKED_IN">報到</option><option value="ATTENDED">出席</option><option value="NO_SHOW">未到</option><option value="RESERVED">更正為待點名</option></select>
        <button type="button" className={button} disabled={pending||!chosen.length||(batchTarget==="CHECKED_IN"&&chosen.some(b=>b.status!=="RESERVED"))} onClick={()=>run(()=>updateCourseRosterBatch({sessionId,target:batchTarget,bookings:chosen.map(b=>({id:b.id,status:b.status}))}))}>{pending?"處理中…":`套用 ${chosen.length} 人`}</button>
        {batchTarget==="CHECKED_IN"&&chosen.some(b=>b.status!=="RESERVED")&&<p className="w-full text-sm">報到僅適用待點名學員，請取消勾選已結算者。</p>}
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={()=>{setShowCancelled(false);setPage(0);}}>上課名單 {activeRows.length}</button>
        <button className={button} onClick={()=>{setShowCancelled(!showCancelled);setPage(0);}}>已取消（{cancelledRows.length}）</button>
        <input
          className={`${button} min-w-48 flex-1 bg-white`}
          value={rosterQuery}
          onChange={e=>{setRosterQuery(e.target.value);setPage(0);}}
          placeholder="搜尋姓名或電話"
          aria-label="搜尋上課名單"
        />
      </div>
      <div className="max-h-[58vh] overflow-y-auto overscroll-contain rounded-xl border border-earth-200 bg-white">
        <div className="sticky top-0 z-[1] hidden grid-cols-[2rem_minmax(8rem,1.1fr)_minmax(10rem,1.2fr)_minmax(7rem,1fr)_6rem_5rem] gap-2 border-b border-earth-200 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600 sm:grid">
          <span />
          <span>姓名／電話</span>
          <span>方案</span>
          <span>備註</span>
          <span>狀態</span>
          <span>操作</span>
        </div>
        <div className="divide-y divide-earth-100">
          {displayedRows.map((b) => (
            <details key={b.id} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[2rem_1fr_auto] items-center gap-2 px-3 py-2 text-sm hover:bg-earth-50 sm:grid-cols-[2rem_minmax(8rem,1.1fr)_minmax(10rem,1.2fr)_minmax(7rem,1fr)_6rem_5rem]">
                <span onClick={e=>e.stopPropagation()}>
                  {canEdit && b.status!=="CANCELLED" && (
                    <input
                      type="checkbox"
                      aria-label={`選取 ${b.customerName}`}
                      checked={selected.includes(b.id)}
                      disabled={pending}
                      onChange={e=>setSelected(old=>e.target.checked?[...old,b.id]:old.filter(id=>id!==b.id))}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate">{b.customerName}</strong>
                  <span className="block truncate text-xs text-earth-500">{b.phone || "未填電話"}</span>
                </span>
                <span className="hidden min-w-0 truncate sm:block">
                  {b.bookingKind === "TRIAL" ? "體驗" : b.planName}
                  {b.bookingKind !== "TRIAL" && <span className="block text-xs text-earth-500">{b.available} {b.unit === "SESSION" ? "堂" : "點"}可用</span>}
                </span>
                <span className="hidden min-w-0 truncate sm:block">{b.serviceNote||b.notes?"有備註":"—"}</span>
                <span className="whitespace-nowrap text-xs">{statusLabel(b)}</span>
                <span className="hidden text-xs text-earth-500 sm:block">查看 ›</span>
                <span className="col-span-2 ml-10 text-xs text-earth-500 sm:hidden">
                  {b.bookingKind === "TRIAL" ? "體驗" : b.planName} · {b.serviceNote||b.notes?"有備註":"無備註"}
                </span>
              </summary>
              <div className="space-y-3 border-t border-earth-100 bg-earth-50/60 px-4 py-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p>預約操作人：{b.operatorName} · {b.operatorCustomerId ? b.operatorCustomerId === b.customerId ? "自己上課" : "共卡代約" : "店長代約"}</p>
                  {b.bookingKind === "TRIAL" ? (
                    <p>體驗金額 NT$ {b.trialPrice} · {b.trialPayments.some(p=>p.status==="SUCCESS") ? `已收款 NT$ ${b.trialPayments.find(p=>p.status==="SUCCESS")!.amount}` : "未收款"}</p>
                  ) : (
                    <p className="text-primary-800">方案：{b.planName} · 可用 {b.available} {b.unit === "SESSION" ? "堂" : "點"}{b.expiresAt ? ` · 到期 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p>
                  )}
                  <p className="sm:col-span-2 text-earth-600">店內備註：{b.serviceNote || "無"}</p>
                  <p className="sm:col-span-2 text-earth-600">本次備註：{b.notes || "無"}</p>
                </div>
                {b.bookingKind === "TRIAL" && allowTrialActions && (
                  <div className="flex flex-wrap gap-2">
                    {trial?.canCollect && b.status!=="CANCELLED" && (
                      <button className={button} disabled={pending || (b.trialPayments.some(p=>p.status==="SUCCESS") && (!trial.canCorrect || b.status!=="RESERVED"))} onClick={()=>{setRequestKey(crypto.randomUUID());setCorrectPayment(b.trialPayments.some(p=>p.status==="SUCCESS"));setPaymentBooking(b.id);}}>
                        {b.trialPayments.some(p=>p.status==="SUCCESS") ? "更正體驗收款" : "體驗收款"}
                      </button>
                    )}
                  </div>
                )}
                {canEdit && b.status === "RESERVED" && (
                  <div className="flex flex-wrap gap-2">
                    {!b.checkedInAt && <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "CHECKED_IN" }))}>報到</button>}
                    <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "NO_SHOW" }))}>未到</button>
                    <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "ATTENDED" }))}>出席</button>
                    <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "CANCELLED" }))}>取消預約</button>
                  </div>
                )}
              </div>
            </details>
          ))}
          {!displayedRows.length && <p className="p-6 text-center text-sm text-earth-500">沒有符合條件的學員。</p>}
        </div>
      </div>
      </ul>
      {rows.length>20&&<nav aria-label="學員分頁" className="flex items-center justify-between"><button className={button} disabled={currentPage===0||pending} onClick={()=>setPage(currentPage-1)}>上一頁</button><span>{currentPage+1} / {Math.ceil(rows.length/20)} · 共 {rows.length} 人</span><button className={button} disabled={(currentPage+1)*20>=rows.length||pending} onClick={()=>setPage(currentPage+1)}>下一頁</button></nav>}
      {!compactOnly && allowTrialActions && trial?.canCreate && trial.settings.trialEnabled && <details className="rounded border border-earth-200 p-3"><summary className="min-h-11 cursor-pointer font-medium">建立體驗預約（不使用方案）</summary><form className="space-y-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);run(()=>createCourseTrial({sessionId,customerId:data.get("customerId"),price:Number(data.get("price")),notes:data.get("notes"),requestKey}));}}>
        <label className="block">實際上課者<select required name="customerId" className={`${button} w-full`}><option value="">選擇本店顧客</option>{trial.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block">體驗金額<input name="price" type="number" required readOnly={!trial.settings.trialAllowPriceEdit} min={trial.settings.trialMinPrice} max={trial.settings.trialMaxPrice} defaultValue={trial.settings.trialDefaultPrice} className={`${button} w-full`}/></label>
        <label className="block">本次備註<textarea name="notes" maxLength={1000} className={`${button} w-full`}/></label>
        <p className="text-sm">先建立未收款預約，保留一位名額；收款與出席分開，不占用或扣除其他方案。</p><button className={button} disabled={pending}>確認體驗預約</button>
      </form></details>}
      {payBooking && paymentSettings && !correctPayment && <CollectTrialModal key={payBooking.id} open onClose={()=>setPaymentBooking(null)} bookingId={payBooking.id} customerName={payBooking.customerName} dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""} expectedAmount={payBooking.trialPrice} people={1} attendedPeople={null} settings={paymentSettings} courseMode saveAction={data=>collectCourseTrial({...data,requestKey})} onCollected={()=>{setPaymentBooking(null);void load();router.refresh();}}/>}
      {payBooking && paymentSettings && correctPayment && receipt && <CorrectTrialCollectionModal key={receipt.id} open onClose={()=>setPaymentBooking(null)} bookingId={payBooking.id} originalTransactionId={receipt.id} customerName={payBooking.customerName} dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""} originalAmount={receipt.amount} originalMethod={receipt.paymentMethod} originalDate={formatTWDateTime(new Date(receipt.createdAt))} people={1} attendedPeople={null} settings={paymentSettings} saveAction={data=>collectCourseTrial({...data,originalPaymentId:data.originalTransactionId,requestKey})} onCorrected={()=>{setPaymentBooking(null);void load();router.refresh();}}/>}
      {!compactOnly && canCreate && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() =>
              createCourseBooking({
                sessionId,
                cardId,
                customerId: data.get("customerId"),
                requestKey,
                notes: data.get("notes"),
              }),
            );
          }}
        >
          <label className="block">
            使用方案
            <select
              className={`${button} w-full`}
              value={cardId}
              required
              onChange={(e) => {
                setCardId(e.target.value);
                setRequestKey(crypto.randomUUID());
              }}
            >
              <option value="">請選擇</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id} disabled={c.expired || c.available < (c.unit === "SESSION" ? 1 : session?.pointCost ?? 1) || (!!session && c.expiresAt < session.startsAt)}>
                  {c.name} · {c.members.map((m) => m.name).join("、")} · 可用{" "}
                  {c.available} {c.unit === "SESSION" ? "堂" : "點"} · 到期 {formatTWDateTime(new Date(c.expiresAt)).slice(0, 10)}{c.expired ? "（已過期）" : c.available < (c.unit === "SESSION" ? 1 : session?.pointCost ?? 1) ? "（可用額度不足）" : session && c.expiresAt < session.startsAt ? "（不涵蓋上課日期）" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            實際上課人
            <select
              className={`${button} w-full`}
              key={cardId}
              name="customerId"
              required
            >
              {card?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">本次備註<textarea className={`${button} w-full`} name="notes" maxLength={1000} /></label>
          {!cards.some((c) => !c.expired && c.available >= (c.unit === "SESSION" ? 1 : session?.pointCost ?? 1) && (!session || c.expiresAt >= session.startsAt)) && <p className="text-sm text-earth-600">沒有可用方案：請確認共卡成員、可用額度及期限是否涵蓋上課日期。</p>}
          <button
            className={`${button} bg-primary-700 text-white`}
            disabled={pending || !card}
          >
            確認預約
          </button>
        </form>
      )}
      {!compactOnly && canEdit && (
        <div>
          {!confirmCancel ? (
            <button
              className={button}
              disabled={pending}
              onClick={() => setConfirmCancel(true)}
            >
              取消整堂課
            </button>
          ) : (
            <div className="space-y-2">
              <p>
                將取消本堂課，影響 {count}{" "}
                位上課人；未完成預約將釋放額度占用，紀錄保留。
              </p>
              <button
                className={button}
                disabled={pending}
                onClick={() =>
                  run(() =>
                    cancelCourseSession({ sessionId, expectedBookings: count }),
                  )
                }
              >
                確認取消整堂課
              </button>
              <button
                className={button}
                onClick={() => setConfirmCancel(false)}
              >
                返回
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
