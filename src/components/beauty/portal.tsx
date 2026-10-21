"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { StoreImageAnnouncements } from "@/components/image-announcements/carousel";
import { BeautyReschedulePanel } from "./reschedule-panel";
import { BeautyBookingForm } from "./booking-form";
import { requestBeautyPlan, changeBeautyStatus } from "@/server/actions/beauty";
import type { BeautyPortalData } from "@/server/beauty/queries";
import { formatTWDateTime,toLocalDateStr,toLocalMonthStr,addTaiwanDuration } from "@/lib/date-utils";
import {courseMonthDays} from '@/lib/course-calendar';
import {CoursePortalBrand,CoursePortalNavigation} from '@/components/course-portal-navigation';
import {CoursePortalCalendar} from '@/components/course-portal-calendar';
import {logoutAction} from '@/server/actions/auth';
import '@/app/(customer)/book/course-portal.css';
const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base disabled:opacity-50";
export function BeautyPortal({ data }: { data: BeautyPortalData }) {
  const [reschedule, setReschedule] = useState<
    BeautyPortalData["items"][number] | null
  >(null);
  const purchaseRequests = useRef(new Map<string, string>());
  const [view, setView] = useState("home"),
    [history,setHistory]=useState(false),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  function change(
    id: string,
    revision: number,
    target: "COMPLETED" | "CANCELLED" | "RESERVED",
  ) {
    const reason = window.prompt("請填寫原因");
    if (!reason) return;
    start(async () => {
      const r = await changeBeautyStatus(data.work ? "work" : "member", {
        id,
        revision,
        target,
        reason,
        requestKey: crypto.randomUUID(),
      });
      if (r.success) router.refresh();
      else setError(r.error);
    });
  }
  const prefix = `/s/${data.store.slug}`;
  const [date,setDate]=useState(toLocalDateStr),[month,setMonth]=useState(toLocalMonthStr);
  const [now]=useState(Date.now);
  const next=[...data.items].filter(b=>b.status==='RESERVED'&&Date.parse(b.startsAt)>now).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0];
  const visibleItems=view==='home'?data.items.filter(b=>toLocalDateStr(new Date(b.startsAt))===toLocalDateStr()):view==='schedule'?data.items.filter(b=>toLocalDateStr(new Date(b.startsAt))===date):view==='bookings'?data.items.filter(b=>(history ? b.status!=='RESERVED'||Date.parse(b.endsAt)<now : b.status==='RESERVED'&&Date.parse(b.endsAt)>=now)):data.items;
  const moveMonth=(delta:number)=>setMonth(addTaiwanDuration(month+'-01',delta,'MONTH').slice(0,7));
  return (
    <div className="course-portal"><header className="cp-top"><CoursePortalBrand storeName={data.store.name}/>{(data.work||data.canWork)?<div className="cp-role-switch" role="group" aria-label="身分切換"><button aria-pressed={!data.work} onClick={()=>router.push(prefix+'/beauty')}>會員</button><button aria-pressed={data.work} onClick={()=>router.push(prefix+'/beauty?work=1')}>我的工作</button></div>:<span>會員專區</span>}<button aria-label="更新" disabled={pending} onClick={()=>router.refresh()}>↻</button></header>
    <CoursePortalNavigation current={view} onSelect={id=>{setView(id);setError('');}} items={data.work?[{id:'home',label:'首頁',icon:'home'},{id:'schedule',label:'我的班表',icon:'calendar'},{id:'income',label:'我的收入',icon:'records'},{id:'account',label:'帳戶',icon:'account'}]:[{id:'home',label:'首頁',icon:'home'},{id:'book',label:'立即預約',icon:'calendar'},{id:'bookings',label:'我的預約',icon:'bookings'},{id:'cards',label:'我的方案',icon:'records'},{id:'account',label:'帳戶',icon:'account'}]}/>
    <main className={`cp-main${data.work?' cp-coach-main':''}`}><div className="cp-title"><h1>{({home:data.work?'今日工作':'會員首頁',book:'預約服務',bookings:'我的預約',schedule:'我的班表',cards:'我的方案',income:'我的收入',account:'帳戶'} as Record<string,string>)[view]}</h1><p>{data.customer?.name}</p></div>
    {view==='home'&&<><StoreImageAnnouncements storeSlug={data.store.slug}/><section className="cp-card cp-next"><div><p>{data.work?'下一筆服務':'下一次預約'}</p><strong>{next?`${formatTWDateTime(new Date(next.startsAt))} · ${next.serviceName}`:'尚無預約安排'}</strong>{next&&<p>{data.techs.find(t=>t.id===next.technicianId)?.name??'店家安排'}</p>}</div><div className="cp-actions"><button className="primary" onClick={()=>setView(data.work?'schedule':'book')}>{data.work?'查看班表':'立即預約'}</button>{next&&<button onClick={()=>setView(data.work?'schedule':'bookings')}>查看預約</button>}</div></section></>}
    {view==='schedule'&&<CoursePortalCalendar month={month} selected={date} unit="次" markers={!data.work} days={courseMonthDays(month).dates.map(d=>({date:d,count:data.items.filter(b=>b.status!=='CANCELLED'&&toLocalDateStr(new Date(b.startsAt))===d).length,closed:false,self:data.items.some(b=>b.customerId===data.customer?.id&&b.status==='RESERVED'&&toLocalDateStr(new Date(b.startsAt))===d)}))} monthPicker={<div className="cp-month"><button aria-label="上個月" onClick={()=>moveMonth(-1)}>‹</button><strong>{month.replace('-',' 年 ')} 月</strong><button aria-label="下個月" onClick={()=>moveMonth(1)}>›</button></div>} context={<><span>我的服務安排</span><button onClick={()=>{setDate(toLocalDateStr());setMonth(toLocalMonthStr());}}>今天</button></>} legend={data.work?'已安排服務次數':'● 本人預約'} onSelect={setDate}/>}
    {view==='account'&&<section className="cp-card cp-pad"><h2>{data.customer?.name}</h2><p>{data.customer?.phone}</p>{!data.work&&<button className="cp-menu" onClick={()=>setView('cards')}>我的方案 →</button>}<form action={logoutAction}><input type="hidden" name="storeSlug" value={data.store.slug}/><button>登出</button></form></section>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {view === "book" && (
        <BeautyBookingForm
          mode="member"
          slug={data.store.slug}
          catalog={data}
          customer={data.customer}
          cards={data.cards}
          members={data.members}
          onBooked={() => router.refresh()}
        />
      )}
      {view==='bookings'&&<div className="cp-actions"><button className={!history?'primary':''} onClick={()=>setHistory(false)}>待服務</button><button className={history?'primary':''} onClick={()=>setHistory(true)}>歷史紀錄</button></div>}
      {["home","schedule","bookings"].includes(view) && (
        <section className={data.work?"cp-work-list":"space-y-3"}>
          {!visibleItems.length && <section className="cp-card cp-pad"><p>{view==="home"?"今天尚無服務安排。":"尚無服務預約。"}</p></section>}
          {visibleItems.map((b) => (
            <article
              key={b.id}
              className={data.work?"cp-card cp-pad cp-work-lesson":"cp-card cp-pad cp-booking-card"} style={data.work?{padding:14}:undefined}
            >
              <h2 className="font-semibold">
                {b.personName}｜{b.serviceName}
              </h2>
              <p>
                {formatTWDateTime(new Date(b.startsAt))}～
                {formatTWDateTime(new Date(b.endsAt))}
              </p>
              <p>
                技師：
                {data.techs.find((t) => t.id === b.technicianId)?.name ??
                  "店家安排"}
                ｜
                {
                  (
                    {
                      RESERVED: "已預約",
                      COMPLETED: "已完成",
                      CANCELLED: "已取消",
                      NO_SHOW: "未到",
                    } as Record<string, string>
                  )[b.status]
                }
              </p>
              <p>
                方案取消{b.cancelDeduct ? "扣次" : "不扣次"}；未到
                {b.noShowDeduct ? "扣次" : "不扣次"}。
              </p>
              {data.work && b.notes && <p>本次備註：{b.notes}</p>}
              {b.status === "RESERVED" && (
                <div className="flex flex-wrap gap-2">
                  {data.work && data.grants.includes("complete") && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => change(b.id, b.revision, "COMPLETED")}
                    >
                      服務完成
                    </button>
                  )}
                  {(!data.work || data.grants.includes("cancel")) && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => change(b.id, b.revision, "CANCELLED")}
                    >
                      取消預約
                    </button>
                  )}
                  {(!data.work || data.grants.includes("reschedule")) && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => {
                        setReschedule(b);
                      }}
                    >
                      改期
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {view === "cards" && (
        <section className="space-y-3">
          <h2 className="font-semibold">購買方案</h2>
          <p>
            {data.bank?.bankName}　{data.bank?.bankAccountNumber}
          </p>
          {data.plans.map((p) => (
            <div key={p.id} className="cp-card cp-pad">
              <span>
                {p.name}｜{p.sessions}次｜NT${p.price}
              </span>
              <button
                className={button}
                disabled={pending}
                onClick={() => {
                  const lastFour = window.prompt("轉帳完成後請填後四碼");
                  if (!lastFour) return;
                  setError("");
                  start(async () => {
                    const key = p.id + lastFour;
                    if (!purchaseRequests.current.has(key))
                      purchaseRequests.current.set(key, crypto.randomUUID());
                    const r = await requestBeautyPlan({
                      planId: p.id,
                      lastFour,
                      requestKey: purchaseRequests.current.get(key)!,
                    });
                    if (r.success) {
                      purchaseRequests.current.delete(key);
                      router.refresh();
                    } else setError(r.error);
                  });
                }}
              >
                已轉帳，送出核帳
              </button>
            </div>
          ))}
          <h2>購買紀錄</h2>
          {data.purchases.map((p) => (
            <p key={p.id}>
              {p.status === "PENDING" ? "待核帳" : "已核帳"}｜
              {formatTWDateTime(new Date(p.createdAt))}
            </p>
          ))}
          <h2>持有方案</h2>
          {!data.cards.length && <p>目前沒有方案，購買請聯絡店家。</p>}
          {data.cards.map((c) => (
            <article key={c.id} className="cp-card cp-pad">
              <h2>{c.name}</h2>
              <p>
                剩餘{c.remaining}次｜已預約{c.held}次｜可用
                {c.closed || Date.parse(c.expiresAt)<=now ? 0 : Math.max(0, c.remaining - c.held)}次
              </p>
              <p>
                {formatTWDateTime(new Date(c.expiresAt))}到期
                {c.closed ? "｜已結清" : Date.parse(c.expiresAt)<=now?"｜已到期":""}
              </p>
            </article>
          ))}
        </section>
      )}
      {reschedule && (
        <BeautyReschedulePanel
          mode={data.work ? "work" : "member"}
          item={reschedule}
          onClose={() => setReschedule(null)}
          onSaved={() => {
            setReschedule(null);
            router.refresh();
          }}
        />
      )}
      {view === "income" && (
        <section>
          {!data.grants.includes("income") ? (
            <p>本人收入尚未開放，請洽店長。</p>
          ) : !data.income.length ? (
            <p>本月尚無已確認拆帳。</p>
          ) : (
            data.income.map((l) => (
              <p className="border-b py-3" key={l.id}>
                {l.serviceName}｜應領{l.fee}元｜已付{l.paid}元
              </p>
            ))
          )}
        </section>
      )}
    </main></div>
  );
}
