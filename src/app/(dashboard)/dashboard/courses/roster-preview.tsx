"use client";

import {RosterToolbar} from "@/components/admin/roster-primitives";
import musicStyles from "./music-roster.module.css";
import sportsStyles from "./sports-roster.module.css";
import {CourseRosterList} from "./roster-list";

export type RosterPreviewBooking = {
  id:string; customerName:string; status:string; customerPhone?:string|null;
};

/** Authorized calendar identity only. Unknown balances are never fabricated. */
export function CourseRosterPreview({bookings,query,onQueryChange,onSearchInteraction,message,onRetry,teacherName,teacherPhone,teacherLabel,source,sportsNative,musicLayout}: {
  bookings:readonly RosterPreviewBooking[];
  query:string;onQueryChange:(query:string)=>void;
  onSearchInteraction:(input:HTMLInputElement|null)=>void;
  message:string;onRetry?:()=>void;
  teacherName:string;teacherPhone:string;teacherLabel:string;
  source?:{list:string;pending:string};sportsNative:boolean;musicLayout:boolean;
}) {
  const active=bookings.filter(row=>row.status!=="CANCELLED");
  const normalized=query.trim().toLocaleLowerCase();
  const matching=active.filter(row=>!normalized||row.customerName.toLocaleLowerCase().includes(normalized)||row.customerPhone?.includes(normalized));
  const button="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm text-earth-700 disabled:text-earth-400";
  return <section data-roster-preview data-roster-ready="false" className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden">
    {!source&&<aside className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm" aria-label={`教師資訊：${teacherName}`}>
      <span className="text-xs text-earth-500">{teacherLabel}</span><strong>{teacherName}</strong>
      {teacherPhone&&<span className="inline-flex min-h-11 items-center text-primary-700">{teacherPhone}</span>}
      <button type="button" disabled className={button}>備註</button>
      <select disabled aria-label={`${teacherLabel}出勤狀態`} className={`${button} ml-auto`}><option>核對中…</option></select>
    </aside>}
    <RosterToolbar label="上課統計">
      <button type="button" disabled className={button}>{source?.list??"上課名單"} {active.length}</button>
      <button type="button" disabled className={button}>{source?.pending??"待點名"} …</button>
      {!source&&<button type="button" disabled className={button}>未收款 …</button>}
      <input value={query} onChange={event=>onQueryChange(event.target.value)} onFocus={event=>onSearchInteraction(event.currentTarget)} onSelect={event=>onSearchInteraction(event.currentTarget)} onBlur={()=>onSearchInteraction(null)} placeholder="搜尋姓名或手機" aria-label={source?"搜尋顧客或手機":"搜尋上課學員"} className="min-h-11 min-w-48 flex-1 rounded-lg border border-earth-200 px-3 py-1.5 text-sm sm:max-w-[14rem]"/>
      <button type="button" disabled className={button}>篩選</button>
    </RosterToolbar>
    <div className="flex shrink-0 items-center gap-2 text-sm text-earth-600">
      <p role={message?"alert":"status"}>{message||"正在核對最新名單…"}</p>
      {message&&onRetry&&<button type="button" className={button} onClick={onRetry}>重新讀取名單</button>}
    </div>
    <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
      {musicLayout?<section className="overflow-x-auto rounded-xl border border-earth-200 bg-white" aria-label="學員">
        <div className={`${musicStyles.header} sticky top-0 z-10 border-b border-earth-200 bg-earth-50 text-sm font-medium text-earth-600`}><span aria-hidden="true"/><span>姓名</span><span>電話</span><span>本期剩餘／課程進度</span><span>標籤／備註</span><span>更多</span></div>
        <ul className="divide-y divide-earth-100">{matching.map(row=><li key={row.id} className={`${musicStyles.row} items-center gap-2 bg-white px-3 py-1 text-sm`}>
          <button type="button" disabled aria-label={`${row.customerName}：核對中`} className="min-h-11 min-w-11 text-earth-400">○</button><span className="min-w-0 break-words font-medium">{row.customerName}</span><span className="text-sm text-earth-400">{row.customerPhone===undefined?"電話核對中":row.customerPhone||"未留電話"}</span><span className="text-sm text-earth-400">核對中</span><span className="text-sm text-earth-400">核對中</span><span aria-hidden="true">…</span>
        </li>)}</ul>
        {!matching.length&&<p className="p-8 text-center text-sm text-earth-500">{normalized?"正在核對搜尋結果…":"正在核對名單…"}</p>}
      </section>:<CourseRosterList preview labels={source?{identity:"顧客／電話",owner:"技師／位置",cost:"本次使用",balance:"可用次數",scroll:"預約名單捲動區"}:sportsNative?{cost:"本堂用量",balance:"本期剩餘"}:{}} empty={normalized?"正在核對搜尋結果…":"正在核對名單…"} rows={matching.map(row=>({
        id:row.id,name:row.customerName,phone:row.customerPhone??null,phonePending:row.customerPhone===undefined,owner:"核對中…",status:"核對中",mark:"pending",statusTitle:"最新資料核對完成後可操作",statusDisabled:true,onStatus:()=>{},onOpen:()=>{},
        cost:<span className="text-sm text-earth-400">核對中</span>,balance:<span className="text-sm text-earth-400">核對中</span>,
        reminders:<span className={`${sportsStyles.reminders} text-sm text-earth-400`}>核對中</span>,
      }))}/> }
    </div>
  </section>;
}
