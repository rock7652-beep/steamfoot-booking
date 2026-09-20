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
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
  allowTrialActions?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected,setSelected]=useState<string[]>([]);
  const [page,setPage]=useState(0);
  const [batchTarget,setBatchTarget]=useState<"CHECKED_IN"|"ATTENDED"|"NO_SHOW"|"RESERVED">("CHECKED_IN");
  const [showCancelled,setShowCancelled]=useState(false);
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
  const rows=showCancelled?cancelledRows:activeRows;
  const currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/10)-1));
  const displayedRows=rows.slice(currentPage*10,currentPage*10+10);
  const count = roster.filter((b) => b.status !== "CANCELLED").length;
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
      <div className="flex gap-2"><button className={button} onClick={()=>{setShowCancelled(false);setPage(0);}}>上課名單 {activeRows.length}</button><button className={button} onClick={()=>{setShowCancelled(!showCancelled);setPage(0);}}>已取消（{cancelledRows.length}）{showCancelled?"收合":""}</button></div>
      <ul className="max-h-[60vh] divide-y overflow-y-auto overscroll-contain">
        {displayedRows.map((b) => (
          <li key={b.id} className="space-y-1 py-2 text-sm">
            <p>
              {canEdit && b.status!=="CANCELLED" && <input type="checkbox" className="mr-2 h-4 w-4" aria-label={`選取 ${b.customerName}`} checked={selected.includes(b.id)} disabled={pending} onChange={e=>setSelected(old=>e.target.checked?[...old,b.id]:old.filter(id=>id!==b.id))}/>}<strong>{b.customerName}</strong> ·{" "}
              {b.bookingKind === "TRIAL" ? ({ATTENDED:"已出席",CANCELLED:"已取消",NO_SHOW:"未到",RESERVED:b.checkedInAt?"已報到":"待出席"}[b.status] ?? b.status) : b.status === "ATTENDED"
                ? "已出席／已扣抵"
                : b.status === "CANCELLED"
                  ? "已取消／已釋放"
                  : b.status === "NO_SHOW" ? "未到／已釋放占用" : b.checkedInAt ? "已報到／待出席，占用額度" : "未報到／占用額度"}{" "}
              {b.bookingKind === "TRIAL" ? "· 體驗不使用方案" : `${b.pointCost} ${b.unit === "SESSION" ? "堂" : "點"}`}
            </p>
            <details><summary className="cursor-pointer py-2 text-earth-600">方案與備註{b.serviceNote||b.notes?" · 有備註":""}</summary><div className="space-y-2 rounded bg-earth-50 p-2">
            <p>
              預約操作人：{b.operatorName} ·{" "}
              {b.operatorCustomerId
                ? b.operatorCustomerId === b.customerId
                  ? "自己上課"
                  : "共卡代約"
                : "店長代約"}
            </p>
            {b.bookingKind === "TRIAL" ? <div className="space-y-2"><p>體驗金額 NT$ {b.trialPrice} · {b.trialPayments.some(p=>p.status==="SUCCESS") ? `已收款 NT$ ${b.trialPayments.find(p=>p.status==="SUCCESS")!.amount}` : "未收款"}</p>
              {allowTrialActions && trial?.canCorrect && b.trialPayments.some(p=>p.status==="SUCCESS") && <details><summary className="min-h-11 cursor-pointer text-sm">作廢體驗收款</summary><form className="space-y-2" onSubmit={e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get("reason")??"");run(()=>voidCourseTrialPayment({paymentId:b.trialPayments.find(p=>p.status==="SUCCESS")!.id,reason}));}}><p className="text-sm">將沖銷本筆收款，保留原紀錄及出席狀態；不會自動退回銀行款項，也不會取消預約。</p><input name="reason" required maxLength={500} placeholder="作廢原因" aria-label="體驗收款作廢原因" className="w-full rounded border p-2"/><button disabled={pending} className={button}>確認作廢收款</button></form></details>}
              {allowTrialActions && trial?.canCollect && b.status!=="CANCELLED" && <button className={button} disabled={pending || (b.trialPayments.some(p=>p.status==="SUCCESS") && (!trial.canCorrect || b.status!=="RESERVED"))} onClick={()=>{setRequestKey(crypto.randomUUID());setCorrectPayment(b.trialPayments.some(p=>p.status==="SUCCESS"));setPaymentBooking(b.id);}}>{b.trialPayments.some(p=>p.status==="SUCCESS") ? "更正體驗收款" : "體驗收款"}</button>}
              <details><summary className="min-h-11 cursor-pointer py-3">收款紀錄</summary>{b.trialPayments.map(p=><p key={p.id}>{formatTWDateTime(new Date(p.createdAt))} · NT$ {p.amount} · {p.status==="SUCCESS"?"已收款":"已作廢"} {p.voidReason}</p>)}</details></div> : <p className="text-primary-800">使用方案：{b.planName} · 可用 {b.available} {b.unit === "SESSION" ? "堂" : "點"}{b.expiresAt ? ` · 到期日 ${formatTWDateTime(new Date(b.expiresAt)).slice(0,10)}` : ""}</p>}
            <p className="text-earth-600">店內備註：{b.serviceNote || "無"}</p>
            <p className="text-earth-600">本次備註：{b.notes || "無"}</p>
            </div></details>
            {canEdit && b.status === "RESERVED" && (
              <div className="flex flex-wrap gap-2">
                {!b.checkedInAt && <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "CHECKED_IN" }))}>報到</button>}
                <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "NO_SHOW" }))}>未到</button>
                <button
                  className={button}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      updateCourseBookingStatus({
                        bookingId: b.id,
                        status: "ATTENDED",
                      }),
                    )
                  }
                >
                  出席
                </button>
                <button
                  className={button}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      updateCourseBookingStatus({
                        bookingId: b.id,
                        status: "CANCELLED",
                      }),
                    )
                  }
                >
                  取消預約
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {rows.length>10&&<nav aria-label="學員分頁" className="flex items-center justify-between"><button className={button} disabled={currentPage===0||pending} onClick={()=>setPage(currentPage-1)}>上一頁</button><span>{currentPage+1} / {Math.ceil(rows.length/10)} · 共 {rows.length} 人</span><button className={button} disabled={(currentPage+1)*10>=rows.length||pending} onClick={()=>setPage(currentPage+1)}>下一頁</button></nav>}
      {allowTrialActions && trial?.canCreate && trial.settings.trialEnabled && <details className="rounded border border-earth-200 p-3"><summary className="min-h-11 cursor-pointer font-medium">建立體驗預約（不使用方案）</summary><form className="space-y-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);run(()=>createCourseTrial({sessionId,customerId:data.get("customerId"),price:Number(data.get("price")),notes:data.get("notes"),requestKey}));}}>
        <label className="block">實際上課者<select required name="customerId" className={`${button} w-full`}><option value="">選擇本店顧客</option>{trial.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block">體驗金額<input name="price" type="number" required readOnly={!trial.settings.trialAllowPriceEdit} min={trial.settings.trialMinPrice} max={trial.settings.trialMaxPrice} defaultValue={trial.settings.trialDefaultPrice} className={`${button} w-full`}/></label>
        <label className="block">本次備註<textarea name="notes" maxLength={1000} className={`${button} w-full`}/></label>
        <p className="text-sm">先建立未收款預約，保留一位名額；收款與出席分開，不占用或扣除其他方案。</p><button className={button} disabled={pending}>確認體驗預約</button>
      </form></details>}
      {payBooking && paymentSettings && !correctPayment && <CollectTrialModal key={payBooking.id} open onClose={()=>setPaymentBooking(null)} bookingId={payBooking.id} customerName={payBooking.customerName} dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""} expectedAmount={payBooking.trialPrice} people={1} attendedPeople={null} settings={paymentSettings} courseMode saveAction={data=>collectCourseTrial({...data,requestKey})} onCollected={()=>{setPaymentBooking(null);void load();router.refresh();}}/>}
      {payBooking && paymentSettings && correctPayment && receipt && <CorrectTrialCollectionModal key={receipt.id} open onClose={()=>setPaymentBooking(null)} bookingId={payBooking.id} originalTransactionId={receipt.id} customerName={payBooking.customerName} dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""} originalAmount={receipt.amount} originalMethod={receipt.paymentMethod} originalDate={formatTWDateTime(new Date(receipt.createdAt))} people={1} attendedPeople={null} settings={paymentSettings} saveAction={data=>collectCourseTrial({...data,originalPaymentId:data.originalTransactionId,requestKey})} onCorrected={()=>{setPaymentBooking(null);void load();router.refresh();}}/>}
      {canCreate && (
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
      {canEdit && (
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
