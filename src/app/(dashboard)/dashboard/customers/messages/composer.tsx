"use client";
import { useEffect,useRef,useState } from "react";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { searchMessageCustomers,selectMessageCustomers,previewMessage,confirmMessage,cancelMessage,loadMessageHistory } from "@/server/actions/customer-messages";
import { CUSTOMER_MESSAGE_LIMIT,CUSTOMER_MESSAGE_MAX_LENGTH,messageDateLabel,messageSchedule,messageStatusText,messageRecipientStatusText,type MessageFilters,type MessagePerson,type MessageOptions,type MessagePreview,type MessageHistory } from "@/lib/customer-message";
import { toLocalDateStr } from "@/lib/date-utils";
import {loadMessageSelection} from "@/server/actions/customer-messages";
import {messageSelectionKey,readMessageSelection} from "@/lib/customer-message-selection";

const steps=["選顧客","寫內容","選發送時間","預覽確認","發送"];
const initialFilters:MessageFilters={search:"",stage:"",line:"",labelId:"",staffId:""};
const stages:Record<string,string>={LEAD:"名單",TRIAL:"已體驗",ACTIVE:"已購課",INACTIVE:"曾購課"};
const lines:Record<string,string>={LINKED:"已連結",UNLINKED:"未連結",BLOCKED:"已封鎖"};
const button="inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-200 bg-white px-4 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-50";
const primary="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary-700 bg-primary-700 px-4 text-sm font-medium text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50";
const field="min-h-11 w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-base text-earth-900";
type SearchResult={rows:MessagePerson[];total:number;page:number};
function RecipientNames({people,results=false}:{people:Array<{id:string;name:string;phone?:string;status?:string;reason?:string|null}>;results?:boolean}){
  const render=(person:typeof people[number])=><li key={person.id} className="min-w-0 break-words py-1"><span className="font-medium">{person.name}</span>{person.phone&&<span className="ml-2 text-sm text-earth-500">{person.phone}</span>}{results&&person.status&&<span className="ml-2 text-sm text-earth-600">{messageRecipientStatusText[person.status]??person.status}</span>}{results&&person.reason&&<p className="text-sm text-earth-500">{person.reason}</p>}</li>;
  return <div className="min-w-0">
    <ul>{people.slice(0,3).map(render)}</ul>
    {people.length>3&&<details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary-700">另 {people.length-3} 位・查看完整名單{results?"與結果":""}</summary><ul className="max-h-64 overflow-y-auto">{people.slice(3).map(render)}</ul></details>}
  </div>;
}
export function CustomerMessageComposer({options,initial,initialHistory,historyOnly=false,selectionToken="",initialSelected=[]}:{options:MessageOptions;initial:SearchResult;initialHistory:MessageHistory[];historyOnly?:boolean;selectionToken?:string;initialSelected?:MessagePerson[]}) {
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [step,setStep]=useState(initialSelected.length?1:0),[filters,setFilters]=useState(initialFilters),[result,setResult]=useState(initial);
  const [selected,setSelected]=useState<Record<string,MessagePerson>>(()=>Object.fromEntries(initialSelected.map(p=>[p.id,p]))),[body,setBody]=useState("");
  const [selectionLoading,setSelectionLoading]=useState(!!selectionToken&&!historyOnly);
  const [timing,setTiming]=useState<"now"|"scheduled">("now"),[date,setDate]=useState(""),[time,setTime]=useState("10:00");
  const [preview,setPreview]=useState<MessagePreview|null>(null),[history,setHistory]=useState(initialHistory);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [completed,setCompleted]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
  const searchTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef(0),pending=useRef(false),dirty=useRef(false),composing=useRef(false);
  const searchInput=useRef<HTMLInputElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const selectedPeople=Object.values(selected),count=selectedPeople.length;
  useEffect(()=>{
    if(!selectionToken||historyOnly)return;
    let active=true;
    async function load(){try{
      const ids=readMessageSelection(sessionStorage.getItem(messageSelectionKey(selectionToken)),options.storeId);
      const response=await loadMessageSelection(options.storeId,ids);
      if(!active)return;
      if(!response.success)throw new Error(response.error);
      setSelected(Object.fromEntries(response.data.map(p=>[p.id,p])));setStep(1);
    }catch(e){if(active)setError(e instanceof Error?e.message:"顧客名單無法讀取，請重新選取");}finally{if(active)setSelectionLoading(false);}}
    void load();return()=>{active=false;};
  },[selectionToken,options.storeId,historyOnly]);
  useCourseDraftGuard(false,busy||uncertain);
  useEffect(()=>{dirty.current=!completed&&(count>0||body.trim().length>0);},[completed,count,body]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[]);
  useEffect(()=>{heading.current?.focus();},[step]);
  useEffect(()=>()=>{request.current++;if(searchTimer.current)clearTimeout(searchTimer.current);},[]);
  async function search(next:MessageFilters,page=1) {
    if(searchTimer.current)clearTimeout(searchTimer.current);
    const seq=++request.current;setFilters(next);setSearching(true);setSearchError("");
    try{const response=await searchMessageCustomers(options.storeId,next,page);if(seq!==request.current)return;if(response.success)setResult(response.data);else setSearchError(response.error);}
    catch{if(seq===request.current)setSearchError("讀取顧客失敗，請重試");}
    finally{if(seq===request.current)setSearching(false);}
  }
  function filter<K extends keyof MessageFilters>(key:K,value:MessageFilters[K]) {void search({...filters,search:searchInput.current?.value??filters.search,[key]:value});}
  function searchText(value:string) {
    if(searchTimer.current)clearTimeout(searchTimer.current);
    request.current++;const next={...filters,search:value};setFilters(next);setSearching(true);
    if(!composing.current)searchTimer.current=setTimeout(()=>void search(next),250);
  }
  async function selectFiltered(){await run(async()=>{const response=await selectMessageCustomers(options.storeId,filters);if(!response.success){setError(response.error);return;}const next={...selected};for(const p of response.data)next[p.id]=p;if(Object.keys(next).length>CUSTOMER_MESSAGE_LIMIT){setError("合計超過 500 位，請先清空已選或縮小篩選範圍");return;}setSelected(next);});}
  async function refreshHistory(){const response=await loadMessageHistory(options.storeId);if(response.success)setHistory(response.data);else setError(response.error);}
  async function run(work:()=>Promise<void>) {
    if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");
    try{await work();}catch{setError("連線中斷，請保留內容並重新確認；系統會使用同一筆訊息，避免重複送出");}
    finally{pending.current=false;setBusy(false);}
  }
  function toggle(person:MessagePerson){setSelected(previous=>{const next={...previous};if(next[person.id])delete next[person.id];else if(Object.keys(next).length<CUSTOMER_MESSAGE_LIMIT)next[person.id]=person;return next;});setPreview(null);}
  function next(){setError("");if(step===0&&!count){setError("請至少選擇一位顧客");return;}if(step===1&&(!body.trim()||body.trim().length>CUSTOMER_MESSAGE_MAX_LENGTH)){setError("請輸入 1～2,000 字的訊息");return;}setStep(step+1);}
  async function showPreview(){
    try{messageSchedule({timing,date,time});}catch(e){setError(e instanceof Error?e.message:"請檢查發送時間");return;}
    await run(async()=>{const response=await previewMessage(options.storeId,{customerIds:selectedPeople.map(p=>p.id),body,timing,date,time});if(!response.success){setError(response.error);return;}setPreview(response.data);setStep(3);});
  }
  async function send(){if(!preview)return;await run(async()=>{try{const response=await confirmMessage(options.storeId,preview.id);if(!response.success){setUncertain(false);setError(response.error);return;}setUncertain(false);setCompleted(response.data.id);setStep(4);await refreshHistory();}catch{setUncertain(true);setError("結果待確認，請按下方按鈕核對同一筆訊息，避免另建一筆重複發送。");}});}
  function restart(){setSelected({});setBody("");setPreview(null);setCompleted(null);setUncertain(false);setStep(0);setTiming("now");setDate("");setError("");setNotice("");}
  const quotaExceeded=preview?.quota?.limit!=null&&preview.quota.used+preview.ready.length>preview.quota.limit;
  const filterCount=[filters.stage,filters.line,filters.labelId,filters.staffId].filter(Boolean).length;
  const filterSummary=[filters.stage?stages[filters.stage]:null,filters.line?`LINE ${lines[filters.line]}`:null,options.labels.find(l=>l.id===filters.labelId)?.name,options.staff.find(s=>s.id===filters.staffId)?.name].filter(Boolean).join("、");
  function clearFilters(){if(searchInput.current)searchInput.current.value="";void search(initialFilters);}
  return <div className="space-y-4 text-base text-earth-900">
    {selectionLoading?<p role="status" className="py-6">正在帶入勾選顧客…</p>:!historyOnly&&<>
    <p className="text-sm font-medium text-primary-800 sm:hidden">步驟 {step+1}／{steps.length}</p>
    <ol aria-label="發送步驟" className="hidden grid-cols-5 gap-2 rounded-xl bg-earth-50 p-3 sm:grid">
      {steps.map((label,i)=><li key={label} aria-current={step===i?"step":undefined} className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm ${step===i?"bg-white font-semibold text-primary-800 shadow-sm":"text-earth-500"}`}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current" aria-hidden="true">{i+1}</span>{label}
      </li>)}
    </ol>
    {options.blocker&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{options.blocker}</p>}
    <section aria-labelledby="message-step-title" className="min-w-0 rounded-xl border border-earth-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="message-step-title" tabIndex={-1} ref={heading} className="text-lg font-semibold outline-none">{steps[step]}</h2>
        <span className="text-sm text-earth-600">{options.storeName}・本店 LINE</span>
      </div>
      {(step===1||step===2)&&<section aria-label="接收對象" className="mb-5 rounded-lg bg-primary-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-primary-900">傳給誰・已選 {count} 位顧客</h3><button type="button" className={button} disabled={busy} onClick={()=>{setStep(0);setPreview(null);setError("");}}>修改對象</button></div>
        <RecipientNames people={selectedPeople}/>
        <p className="mt-1 text-sm text-earth-600">可發送名單會在預覽時核對。</p>
      </section>}
      {step===0&&<fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="sr-only">選擇收件顧客</legend>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();if(!composing.current)void search({...filters,search:searchInput.current?.value??""});}}>
          <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto">
            <span className="sr-only">搜尋顧客</span>
            <input ref={searchInput} defaultValue={filters.search} className={field} placeholder="搜尋姓名、電話或 LINE 名稱"
              onCompositionStart={()=>{composing.current=true;}}
              onCompositionEnd={e=>{composing.current=false;searchText(e.currentTarget.value);}}
              onChange={e=>searchText(e.target.value)}/>
          </label>
          <button type="button" className={button} aria-expanded={filtersOpen} aria-controls="customer-message-filters" onClick={()=>setFiltersOpen(value=>!value)}>
            篩選條件{filterCount>0?`（${filterCount}）`:""}<span aria-hidden="true" className="ml-2">{filtersOpen?"▴":"▾"}</span>
          </button>
          {(filters.search||filterCount>0)&&<button type="button" className={button} onClick={clearFilters}>清除條件</button>}
        </form>
        <div id="customer-message-filters" hidden={!filtersOpen} className={filtersOpen?"grid grid-cols-1 gap-3 rounded-lg bg-earth-50 p-3 sm:grid-cols-2 lg:grid-cols-4":"hidden"}>
          <label className="text-sm">顧客階段<select aria-label="顧客階段" className={`${field} mt-1`} value={filters.stage} onChange={e=>filter("stage",e.target.value as MessageFilters["stage"])}>
            <option value="">全部階段</option>{Object.entries(stages).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="text-sm">LINE 狀態<select aria-label="LINE 狀態" className={`${field} mt-1`} value={filters.line} onChange={e=>filter("line",e.target.value as MessageFilters["line"])}>
            <option value="">全部狀態</option>{Object.entries(lines).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          {options.labels.length>0&&<label className="text-sm">顧客標籤<select aria-label="顧客標籤" className={`${field} mt-1`} value={filters.labelId} onChange={e=>filter("labelId",e.target.value)}>
            <option value="">全部標籤</option>{options.labels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>}
          {options.staff.length>0&&<label className="text-sm">負責人員<select aria-label="負責人員" className={`${field} mt-1`} value={filters.staffId} onChange={e=>filter("staffId",e.target.value)}>
            <option value="">全部人員</option>{options.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>}
        </div>
        {!!filterSummary&&<p className="text-sm text-primary-800">已套用：{filterSummary}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-sm text-earth-500">
            {searching?"搜尋中…":`符合 ${result.total} 位`}<span className="ml-3 font-semibold text-primary-800">已選 {count} 位</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={searching||!!searchError||!result.rows.length} onClick={()=>setSelected(previous=>{
              const next={...previous};for(const p of result.rows)if(Object.keys(next).length<CUSTOMER_MESSAGE_LIMIT)next[p.id]=p;return next;
            })}>選取本頁</button>
            <button type="button" className={button} disabled={searching||!!searchError||!result.total||result.total>CUSTOMER_MESSAGE_LIMIT} onClick={()=>void selectFiltered()}>全選符合的 {result.total} 位</button>
            {count>0&&<button type="button" className={button} onClick={()=>setSelected({})}>清空已選</button>}
          </div>
        </div>
        {searchError?<p role="alert" className="text-red-700">{searchError}<button type="button" className={`${button} ml-2`} onClick={()=>void search(filters,result.page)}>重新讀取</button></p>
          :<div aria-busy={searching} className="max-h-96 overflow-y-auto rounded-lg border border-earth-200">
            {result.rows.length?result.rows.map(person=><label key={person.id} className={`flex min-h-16 cursor-pointer items-center gap-3 border-b border-earth-100 px-3 py-2 last:border-0 ${searching?"opacity-50":""}`}>
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary-700" aria-label={`選擇 ${person.name}`} checked={!!selected[person.id]} disabled={searching||count>=CUSTOMER_MESSAGE_LIMIT&&!selected[person.id]} onChange={()=>toggle(person)}/>
              <span className="min-w-0 flex-1"><span className="block break-words font-medium">{person.name}</span><span className="text-sm text-earth-500">{person.phone}</span></span>
              <span className="shrink-0 text-sm text-earth-600">{lines[person.lineStatus]??"待核對"}</span>
            </label>):<p className="p-5 text-earth-500">沒有符合條件的顧客，請調整搜尋或篩選。</p>}
          </div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-earth-500">跨頁勾選會保留，每次最多 {CUSTOMER_MESSAGE_LIMIT} 位。</span>
          <div className="flex gap-2">
            <button type="button" className={button} disabled={searching||result.page<=1} onClick={()=>void search(filters,result.page-1)}>上一頁</button>
            <span className="self-center text-sm">{result.page}／{Math.max(1,Math.ceil(result.total/25))}</span>
            <button type="button" className={button} disabled={searching||result.page*25>=result.total} onClick={()=>void search(filters,result.page+1)}>下一頁</button>
          </div>
        </div>
        {count>0&&<details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">查看已選 {count} 位顧客</summary>
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">{selectedPeople.map(p=><button type="button" key={p.id} className={button} onClick={()=>toggle(p)} aria-label={`移除 ${p.name}`}>{p.name} ×</button>)}</div>
        </details>}
      </fieldset>}
      {step===1&&<div className="space-y-3">
        <p className="text-sm text-earth-600">已選 {count} 位顧客，請輸入要傳送的內容。</p>
        <label className="block font-medium" htmlFor="message-body">訊息內容</label>
        <textarea id="message-body" className={`${field} min-h-56 resize-y`} value={body} maxLength={CUSTOMER_MESSAGE_MAX_LENGTH} placeholder="輸入想傳給顧客的內容…" onChange={e=>{setBody(e.target.value);setPreview(null);}}/>
        <p className="text-right text-sm text-earth-500">{body.length}／{CUSTOMER_MESSAGE_MAX_LENGTH} 字</p>
      </div>}
      {step===2&&<div className="space-y-4">
        <fieldset className="flex flex-wrap gap-3"><legend className="mb-2 text-sm text-earth-600">什麼時候傳送？</legend>
          {[["now","立即發送"],["scheduled","指定時間"]].map(([value,label])=><label key={value} className={`${button} cursor-pointer gap-2`}>
            <input type="radio" name="message-timing" value={value} checked={timing===value} onChange={()=>setTiming(value as "now"|"scheduled")}/>{label}
          </label>)}
        </fieldset>
        {timing==="scheduled"&&<div className="grid max-w-lg gap-3 sm:grid-cols-2">
          <label className="text-sm">發送日期<input type="date" className={`${field} mt-1`} min={toLocalDateStr()} value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label className="text-sm">發送時間<input type="time" className={`${field} mt-1`} value={time} onChange={e=>setTime(e.target.value)}/></label>
        </div>}
        <p className="text-sm text-earth-500">台灣時間，可安排未來 90 天內。</p>
      </div>}
      {step===3&&preview&&<div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div><p className="text-sm text-earth-500">傳給誰</p>
            <p className="mt-1 text-xl font-semibold text-primary-900">預計發送 {preview.ready.length} 位顧客</p>
            <RecipientNames people={preview.ready}/>
          </div>
          <div><p className="text-sm text-earth-500">何時發送</p><p className="mt-1 font-semibold">{preview.immediate?"確認後立即發送":messageDateLabel(preview.scheduledAt)+"（台灣時間）"}</p></div>
          {preview.excluded.length>0&&<details open className="rounded-lg bg-amber-50 px-3 text-amber-900">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{preview.excluded.length} 位顧客不會發送</summary>
            <ul className="max-h-40 space-y-2 overflow-y-auto pb-3 text-sm">{preview.excluded.map(p=><li key={p.id}>{p.name}：{p.reason}</li>)}</ul>
          </details>}
          <div className="border-t border-earth-100 pt-3">
            <p className="text-sm">預估使用 {preview.ready.length} 則 LINE 訊息用量</p>
            <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-earth-500">用量與發送說明</summary>
              <div className="space-y-2 text-sm text-earth-500">
                <p>{preview.quota?`LINE 本月已用 ${preview.quota.used} 則${preview.quota.limit===null?"":`／上限 ${preview.quota.limit} 則`}`:"確認時會重新查詢 LINE 額度"}，實際計費以 LINE 為準。</p>
                <p>訊息會依序發送，實際結果請看發送紀錄；LINE 已接受不代表送達或已讀。</p>
                <p>預覽有效至 {messageDateLabel(preview.expiresAt)}。</p>
              </div>
            </details>
          </div>
          {preview.blocker&&preview.blocker!==options.blocker&&<p role="alert" className="text-sm text-amber-800">{preview.blocker}</p>}
          {quotaExceeded&&<p role="alert" className="text-sm text-red-700">LINE 剩餘額度不足，請減少收件人。</p>}
        </div>
        <div className="min-w-0 self-start rounded-xl bg-earth-100 p-4">
          <p className="mb-3 text-sm font-medium text-earth-600">訊息內容</p>
          <div className="whitespace-pre-wrap break-words rounded-xl bg-white p-4 leading-7 shadow-sm">{preview.body}</div>
        </div>
      </div>}
      {step===4&&<div role="status" className="space-y-3 py-4">
        <p className="text-lg font-semibold text-primary-800">{timing==="scheduled"?"已建立發送排程":"已排入發送"}</p>
        <p className="text-sm text-earth-600">下方可查看進度，或取消尚未開始發送的訊息。</p>
        <button type="button" className={button} onClick={restart}>新增另一則訊息</button>
      </div>}
      {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {step<4&&<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-earth-100 pt-4">
        <button type="button" className={button} disabled={busy||uncertain||step===0} onClick={()=>{setStep(step-1);setPreview(null);setError("");}}>上一步</button>
        {step<2?<button type="button" className={primary} disabled={busy||step===0&&!count} onClick={next}>下一步：{steps[step+1]}</button>
          :step===2?<button type="button" className={primary} disabled={busy} onClick={()=>void showPreview()}>{busy?"正在核對…":"預覽確認"}</button>
          :<button type="button" className={primary} disabled={busy||!preview?.ready.length||!!preview.blocker||!!quotaExceeded} onClick={()=>void send()}>
            {busy?"正在確認…":uncertain?"核對同一筆發送結果":preview?.immediate?`確認發送給 ${preview.ready.length} 位`:`確認排程給 ${preview?.ready.length??0} 位`}
          </button>}
      </div>}
    </section>
    </>}
    {historyOnly&&error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
    <details key={completed??"draft"} open={historyOnly||!!completed} className="rounded-xl border border-earth-200 bg-white px-4 sm:px-5">
      <summary className="min-h-11 cursor-pointer py-4 text-base font-semibold">發送紀錄{history.length>0?`（${history.length}）`:""}</summary>
      <div className="border-t border-earth-100 pb-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-earth-500">最近 30 筆；LINE 已接受不代表送達或已讀。</p>
          <button type="button" className={button} disabled={busy} onClick={()=>void run(refreshHistory)}>更新紀錄</button>
        </div>
        {notice&&<p role="status" className="mb-3 text-sm text-primary-800">{notice}</p>}
        {history.length?<ul className="divide-y divide-earth-100">{history.map(item=><li key={item.id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{messageStatusText[item.status]??item.status}・{messageDateLabel(item.scheduledAt)}</p>
            {item.status==="QUEUED"&&<button type="button" className={button} disabled={busy} onClick={()=>{
              if(window.confirm("取消尚未開始發送的訊息？傳送中的請求可能仍會完成。"))void run(async()=>{
                const response=await cancelMessage(options.storeId,item.id);if(!response.success){setError(response.error);return;}
                await refreshHistory();setNotice("已取消尚未開始發送的訊息；傳送中的請求可能仍會完成。");
              });
            }}>取消未發送訊息</button>}
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{item.body}</p>
          <div className="rounded-lg bg-earth-50 px-3 py-2"><p className="text-sm text-earth-500">接收對象・{item.total} 位</p><RecipientNames people={item.recipients} results/></div>
          <p className="text-sm text-earth-600">LINE 已接受 {item.accepted}・待處理 {item.pending}・未接受 {item.failed}・未發送 {item.skipped}{item.unknown>0?`・結果待確認 ${item.unknown}`:""}</p>
        </li>)}</ul>:<p className="py-3 text-earth-500">尚無發送紀錄</p>}
      </div>
    </details>
  </div>;
}
