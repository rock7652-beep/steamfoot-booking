"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { DashboardLink } from "@/components/dashboard-link";
import type { CourseBusinessReport } from "@/server/queries/course-business-analytics";
type Segment = keyof CourseBusinessReport["counts"];
const names: Record<Segment,string> = {trial:"體驗人數",newCard:"新卡人數",renewal:"續卡人數",converted:"本期體驗開卡",unconverted:"體驗未開卡",tracked:"過往體驗追蹤開卡",visitors:"不重複來客人數",newVisitors:"新客人數",oldVisitors:"舊客人數",returned:"已回流人數",notReturned:"尚未回流人數"};
export function BusinessAnalyticsView({data,all,staffId}:{data:CourseBusinessReport;all:boolean;staffId?:string|null}) {
  const router=useRouter(),search=useSearchParams();
  const [pending,start]=useTransition();
  const [segment,setSegment]=useState<Segment|null>(null),[keyword,setKeyword]=useState(""),[page,setPage]=useState(1);
  const [metric,setMetric]=useState<"attendance"|"trial"|"newCard"|"renewal"|"revenue">("attendance");
  const [trendPeriod,setTrendPeriod]=useState<"current"|"months"|"year">("current");
  const [visitDetail,setVisitDetail]=useState(false);
  const [review,setReview]=useState<"profit"|"fees"|null>(null),[reviewPage,setReviewPage]=useState(1);
  function toggleReview(value:"profit"|"fees"){setReview(review===value?null:value);setReviewPage(1);}
  const listRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(segment)listRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[segment,visitDetail]);
  const coach=data.scope.view==="coach";
  function navigate(view:string,person:string) {const params=new URLSearchParams(search.toString());params.set("perspective",view);params.set("person",person);start(()=>router.push(`?${params}`));}
  function show(value:Segment) {setVisitDetail(false);setSegment(segment===value?null:value);setKeyword("");setPage(1);}
  const people=data.staff.filter(s=>(all||s.id===staffId)&&(coach?s.courseCoachEnabled||s.id===data.scope.person:s.user.role!=="CUSTOMER"||s.id===data.scope.person));
  const rows=segment?(data.segments?.[segment]??[]).filter(p=>p.name.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase())):[];
  const pages=Math.max(1,Math.ceil(rows.length/10));
  const change=(current:number,prior:number|undefined)=>prior===undefined?null:<span className="mt-1 block text-xs text-earth-500">較{data.comparison?.label} {current-prior>0?"+":""}{current-prior}{prior>0?`（${((current-prior)/prior*100).toFixed(1)}%）`:"（前期為 0）"}</span>;
  const attendanceCard=<button type="button" disabled={!data.segments||pending} aria-expanded={segment==="visitors"&&visitDetail} onClick={()=>{setSegment(segment==="visitors"&&visitDetail?null:"visitors");setVisitDetail(true);setKeyword("");setPage(1);}} className="min-h-24 rounded-xl border border-earth-200 bg-white p-4 text-left enabled:hover:border-primary-500"><span className="text-sm text-earth-600">{coach?"授課來客人次":"來客人次"}</span><strong className="mt-2 block text-2xl text-primary-900">{data.attendance} <span className="text-sm font-normal">人次</span></strong>{change(data.attendance,data.comparison?.attendance)}{data.segments&&<span className="mt-1 block text-xs text-primary-700">查看每人出席堂數</span>}</button>;
  const metricNames={attendance:"來客人次",trial:"體驗人數",newCard:coach?"體驗後新卡":"新卡人數",renewal:"續卡人數",revenue:"收款淨額"};
  const unit=metric==="revenue"?"元":metric==="attendance"?"人次":"人";
  const monthly=trendPeriod!=="current";
  const monthRows=trendPeriod==="year"?data.monthlyTrend:data.monthlyTrend.slice(-6);
  const missingMonths=monthRows.filter(row=>!row.available);
  const missingMonthLabel=missingMonths.length>1?`${missingMonths[0].date.replace("-","/")} ～ ${missingMonths.at(-1)!.date.replace("-","/")}`:missingMonths[0]?.date.replace("-","/");
  const reviewRows=review==="profit"?data.pendingProfit:data.pendingFees;
  const chartRows=monthly?monthRows.map(row=>({...row,[metric]:row.available?(row as unknown as Record<string,number>)[metric]:null})):data.trend;
  const selectedClass=(selected:boolean)=>`min-h-11 rounded-lg border px-3 text-sm ${selected?"border-primary-700 bg-primary-700 text-white":"border-earth-200 bg-white text-earth-700"}`;
  const metricCard=(key:Segment)=><button key={key} type="button" disabled={!data.segments||pending} aria-expanded={segment===key} onClick={()=>show(key)} className="min-h-24 rounded-xl border border-earth-200 bg-white p-4 text-left enabled:hover:border-primary-500"><span className="text-sm text-earth-600">{names[key]}</span><strong className="mt-2 block text-2xl text-primary-900">{data.counts[key]} <span className="text-sm font-normal">人</span></strong>{(key==="trial"||key==="newCard"||key==="renewal")&&change(data.counts[key],data.comparison?.[key])}{data.segments&&<span className="mt-1 block text-xs text-primary-700">查看名單</span>}</button>;
  return <div className="space-y-4" aria-busy={pending}>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="分析對象">
      {([['store','店家'],['manager','直屬店長'],['coach','教練']] as const).filter(([v])=>all||v!=="store").map(([v,label])=><button key={v} disabled={pending} aria-pressed={data.scope.view===v} onClick={()=>navigate(v,all?"all":staffId!)} className={`min-h-11 rounded-lg border px-4 text-sm ${data.scope.view===v?"bg-primary-700 text-white":"bg-white text-earth-700"}`}>{label}</button>)}
      {data.scope.view!=="store"&&<select aria-label={coach?"選擇教練":"選擇直屬店長"} disabled={pending} value={data.scope.person} onChange={e=>navigate(data.scope.view,e.target.value)} className="h-11 max-w-full appearance-none rounded-lg border border-earth-200 bg-white py-2 pl-3 pr-9 text-sm text-earth-700" style={{backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"}}>
        {all&&<option value="all">{coach?"全部教練":"全部直屬店長"}</option>}{people.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}{all&&!coach&&<option value="unassigned">未歸屬</option>}
      </select>}
      {pending&&<span role="status" className="text-sm text-earth-500">更新分析中…</span>}
    </div>
    <p className="text-xs text-earth-500">{data.comparison?`比較${data.comparison.label}：${data.comparison.range.startDate} ～ ${data.comparison.range.endDate}；本期截至 ${data.effectiveEndDate}`:"所選區間尚未開始，暫無同期比較。"}</p>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {attendanceCard}
      {metricCard("trial")}
      {coach?<><Summary label="實際授課" value={`${data.sessions} 堂`}/><Summary label="授課時數" value={`${data.hours.toFixed(1)} 小時`}/><Summary label="應計授課費" value={moneyValue(data.fee,data.sessions-data.missingFees,data.missingFees)} note={data.missingFees?`${data.missingFees} 堂費率待核對，未計入` : "依已結束且有出席課次的固定費率"} action={data.missingFees>0?<button type="button" aria-expanded={review==="fees"} onClick={()=>toggleReview("fees")} className="min-h-11 text-sm text-primary-700 underline underline-offset-4">查看待核對明細</button>:undefined}/></>:<>{metricCard("newCard")}{metricCard("renewal")}<button disabled={!data.segments||pending} onClick={()=>show("converted")} className="min-h-24 rounded-xl border border-earth-200 bg-white p-4 text-left"><span className="text-sm text-earth-600">體驗開卡率</span><strong className="mt-2 block text-2xl text-primary-900">{data.conversionRate===null?"—":`${data.conversionRate.toFixed(1)}%`}</strong><span className="mt-1 block text-xs text-earth-500">{data.counts.converted} / {data.eligibleTrials} 位新客體驗者</span></button></>}
    </div>
    <div className="rounded-xl border border-earth-200 bg-white px-4 py-3 text-sm">
      {!coach&&<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-earth-100 pb-3">
        <span>總營收 <strong>{data.netRevenue===null?"無檢視權限":`NT$ ${data.netRevenue.toLocaleString()}`}</strong></span>
        {data.retail&&<span>零售收入 <strong>NT$ {data.retail.revenue.toLocaleString()}</strong> <span className="text-xs text-earth-500">{data.retail.transactionCount} 筆 · {data.retail.customerCount} 位顧客</span></span>}
        {data.scope.view==="manager"&&<span>方案利潤 <strong>{moneyValue(data.profit,data.knownProfit,data.missingProfit)}</strong>{data.missingProfit>0&&<button type="button" aria-expanded={review==="profit"} onClick={()=>toggleReview("profit")} className="ml-2 min-h-11 text-amber-700 underline underline-offset-4">{data.missingProfit} 筆待核對・查看明細</button>}</span>}
      </div>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 xl:grid-cols-5">
        {(["unconverted","tracked","visitors","newVisitors","oldVisitors"] as Segment[]).map(key=><button key={key} disabled={!data.segments||pending} className="min-h-11 py-2 text-left text-primary-700 underline underline-offset-4 disabled:no-underline" onClick={()=>show(key)}><span className="block">{names[key]}</span><strong className="block font-medium">{data.counts[key]} 人</strong></button>)}
      </div>
    </div>
    {data.retail&&<section aria-label="零售分析" className="rounded-xl border border-earth-200 bg-white p-4"><h2 className="font-semibold">零售分析</h2><p className="my-3 text-sm">零售收入 NT$ {data.retail.revenue.toLocaleString()} · {data.retail.transactionCount} 筆 · {data.retail.customerCount} 位顧客</p>{data.retail.items.length?<ul className="divide-y divide-earth-100">{data.retail.items.map(item=><li key={item.name} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><strong>{item.name}</strong><span>NT$ {item.revenue.toLocaleString()} · {item.transactionCount} 筆 · {item.customerCount} 位顧客</span></li>)}</ul>:<p className="py-3 text-sm text-earth-500">本期尚無零售紀錄。請在「現金收支」新增收入、選擇零售商品並關聯顧客，儲存後會納入此區。</p>}</section>}
    {review&&<section className="rounded-xl border border-earth-200 bg-white p-4" aria-label="待核對明細">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{review==="profit"?"方案利潤":"授課費"}待核對（{reviewRows.length} {review==="profit"?"筆":"堂"}）</h2><button className="min-h-11 px-3 text-sm" onClick={()=>setReview(null)}>關閉明細</button></div>
      <p className="mb-2 text-sm text-earth-500">以下項目尚未計入金額，請依原始成交或授課紀錄核對。</p>
      <ul className="divide-y divide-earth-100">{reviewRows.slice((reviewPage-1)*10,reviewPage*10).map(row=><li key={row.id} className="py-3 text-sm"><div className="flex flex-wrap gap-x-3 gap-y-1"><span className="text-earth-500">{row.date}</span><strong>{row.name}</strong><span>{"coachName" in row?row.coachName:row.customerName}</span></div><p className="mt-1 text-amber-700">{row.reason}</p></li>)}</ul>
      {reviewRows.length>10&&<div className="flex items-center justify-end gap-3 text-sm"><button className="min-h-11 px-3" disabled={reviewPage===1} onClick={()=>setReviewPage(reviewPage-1)}>上一頁</button><span>{reviewPage} / {Math.ceil(reviewRows.length/10)}</span><button className="min-h-11 px-3" disabled={reviewPage*10>=reviewRows.length} onClick={()=>setReviewPage(reviewPage+1)}>下一頁</button></div>}
    </section>}
    {segment&&data.segments&&<section ref={listRef} className="rounded-xl border border-primary-200 bg-white p-4" aria-label={`${visitDetail?"來客人次":names[segment]}名單`}>
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{visitDetail?`來客人次 ${data.attendance} 人次 · ${data.counts.visitors} 人`: `${names[segment]}（${data.counts[segment]} 人）`}</h2><button className="min-h-11 px-3 text-sm" onClick={()=>setSegment(null)}>關閉名單</button></div>
      <input aria-label="搜尋名單" placeholder="搜尋顧客姓名" value={keyword} onChange={e=>{setKeyword(e.target.value);setPage(1);}} className="mb-2 min-h-11 w-full rounded-lg border px-3"/>
      <ul className="divide-y">{rows.slice((page-1)*10,page*10).map(p=><li key={p.id}><DashboardLink className="block min-h-11 py-3 text-sm text-primary-700" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(p.id)}`}>{p.name}{visitDetail&&<span className="float-right text-earth-600">出席 {p.visits} 堂</span>}</DashboardLink></li>)}</ul>
      {!rows.length&&<p className="py-3 text-sm text-earth-500">沒有符合條件的顧客。</p>}
      {pages>1&&<div className="flex items-center justify-end gap-3 text-sm"><button className="min-h-11 px-3" disabled={page===1} onClick={()=>setPage(page-1)}>上一頁</button><span>{page} / {pages}</span><button className="min-h-11 px-3" disabled={page===pages} onClick={()=>setPage(page+1)}>下一頁</button></div>}
    </section>}
    <section className="rounded-xl border border-earth-200 bg-white p-4" aria-label="趨勢分析">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{metricNames[metric]}趨勢</h2><div className="flex flex-wrap gap-2" role="group" aria-label="圖表期間">{([['current','本期'],['months','近六個月'],['year','近一年']] as const).map(([value,label])=><button key={value} className={selectedClass(trendPeriod===value)} aria-pressed={trendPeriod===value} onClick={()=>setTrendPeriod(value)}>{label}</button>)}</div></div>
      <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="趨勢指標">{(['attendance','trial','newCard','renewal','revenue'] as const).filter(key=>(!coach||key!=="renewal")&&(key!=="revenue"||data.netRevenue!==null)).map(key=><button key={key} className={selectedClass(metric===key)} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{metricNames[key]}</button>)}</div>
      <p className="mb-3 text-xs text-earth-500">{monthly?`${monthRows[0]?.date} ～ ${monthRows.at(-1)?.date}，按月統計`:`${data.range.startDate} ～ ${data.range.endDate}，按日統計`} · 單位：{unit} · 截至 {data.effectiveEndDate}。未完整月份以累計值呈現。</p>
      {metric==="renewal"&&<p className="mb-3 text-xs text-earth-500">同一人於同一{monthly?"月":"日"}續卡多筆只算 1 人；各{monthly?"月":"日"}人數不可直接相加為整期不重複人數。</p>}
      {chartRows.length?<div className="overflow-x-auto"><div className={`h-60 ${monthly?(trendPeriod==="year"?"min-w-[840px]":"min-w-[480px]"):"min-w-0"}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{top:26,right:32,left:8,bottom:8}}><CartesianGrid strokeDasharray="3 3" stroke="#e7e5df"/><XAxis dataKey="date" tickFormatter={v=>monthly?`${v.slice(0,4)}/${Number(v.slice(5))}月`:v.slice(5)} interval={monthly?0:"preserveStartEnd"} minTickGap={24} tick={{fontSize:11}}/><YAxis allowDecimals={false} tickFormatter={v=>Number(v).toLocaleString()}/><Tooltip labelFormatter={v=>String(v)} formatter={v=>[`${Number(v).toLocaleString()} ${unit}`,metricNames[metric]]}/><Line type="linear" dataKey={metric} name={metricNames[metric]} stroke="#427663" strokeWidth={2} connectNulls={false} dot={monthly?{r:4}:false} isAnimationActive={false}>{monthly&&<LabelList dataKey={metric} position="top" formatter={v=>v===null||v===undefined?"":Number(v).toLocaleString()} style={{fontSize:11,fill:"#345a4c"}}/>}</Line></LineChart></ResponsiveContainer></div></div>:<p className="py-8 text-center text-sm text-earth-500">本期尚無紀錄。</p>}
      {monthly&&<><p className="mt-2 text-xs text-earth-500 lg:hidden">可左右滑動查看各月份。</p>{monthRows.some(row=>!row.available)&&<p className="mt-2 text-xs text-earth-500">尚無資料：{missingMonthLabel}（早於建店且無歷史紀錄，不以 0 計算）。</p>}</>}
    </section>
    <section className="rounded-xl border border-earth-200 bg-white p-4" aria-label="回流分析">
      <h2 className="font-semibold">回流分析</h2>
      {data.retentionBase===0?<p className="mt-2 text-sm text-earth-500">{data.retentionRange?`${data.retentionRange.startDate} ～ ${data.retentionRange.endDate} 無出席顧客，暫無回流比較基準。`:"所選區間尚未開始，暫無回流比較基準。"}</p>:<>
        <p className="my-2 text-xs text-earth-500">以 {data.retentionRange?.startDate} ～ {data.retentionRange?.endDate} 出席的 {data.retentionBase} 位顧客為基準，查看本期是否再次出席。尚未回流不等於流失；同一人多堂仍只算一位。</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metricCard("returned")}<Summary label="顧客回流率" value={data.retentionRate===null?"—":`${data.retentionRate.toFixed(1)}%`} note={`${data.counts.returned} / ${data.retentionBase} 人`}/>{metricCard("notReturned")}</div>
      </>}
    </section>
    {coach&&<details className="rounded-xl border border-earth-200 bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">體驗後開卡成果</summary><p className="my-2 text-sm text-earth-600">歸給首次付費前最後一次完成體驗的授課教練，供教學追蹤；成交業績仍歸直屬店長。</p><div className="grid grid-cols-2 gap-3">{metricCard("newCard")}{metricCard("converted")}</div></details>}
    {!coach&&<details className="rounded-xl border border-earth-200 bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">授課明細</summary><p className="py-2 text-sm">實際授課 {data.sessions} 堂 · {data.hours.toFixed(1)} 小時 · 出席 {data.attendance} 人次</p></details>}
    <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3">統計方式與歸屬</summary><div className="space-y-2 pb-3"><p>來客人次按實際出席累計：兩人各上一堂算 2 人次，同一人上兩堂也算 2 人次；取消與未到不計。不重複來客人數則每人只算一次。新客為首次在本店出席落在本期，舊客為先前已出席者。</p><p>近六個月與近一年以所選區間的結束月份為終點，未來日期截至今日；各月體驗、新卡、續卡按月去重，本期每日人數不可直接相加為整期人數。</p><p>體驗依完成出席計算並按人去重；新卡為首次付費方案，續卡為後續付費方案。免費指派、共卡加入與全額退款不算成交。新卡與續卡可能是同一人，本期人數不可直接相加。</p><p>體驗開卡率只計同批首次購買前的體驗者；追蹤開卡歸實際購買月份，另列過往體驗。沒有體驗者時顯示 —。</p><p>直屬店長的體驗與上課依顧客目前歸屬；成交依購買時快照，未指定列未歸屬，不使用核帳人代替。教練依課次授課紀錄。角色數字不可重複加總。</p><p>總營收包含方案、體驗與現金帳中「零售-」分類的收入，扣除當期退款／沖銷；其他現金帳收入不重複加總。方案利潤依成交快照，部分退款或缺少快照列待核對。授課費依每堂固定費率，缺少費率另列待核對。</p></div></details>
  </div>;
}
function Summary({label,value,note,action}:{label:string;value:string;note?:string;action?:React.ReactNode}) {return <div className="min-h-24 rounded-xl border border-earth-200 bg-white p-4"><p className="text-sm text-earth-600">{label}</p><strong className="mt-2 block text-2xl text-primary-900">{value}</strong>{note&&<p className="mt-1 text-xs text-earth-500">{note}</p>}{action}</div>;}

function moneyValue(value:number|null,known:number,missing:number) {
  if(value===null)return "無檢視權限";
  if(missing>0&&known===0)return "待核對";
  return `${missing>0?"已確認金額 ":""}NT$ ${value.toLocaleString()}`;
}
