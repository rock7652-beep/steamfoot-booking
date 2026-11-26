"use client";
import {useRef,useState} from "react";
import {SettingsListRow} from "@/components/settings/settings-workspace";
import {AI_ROUTING_SCENARIOS,type AiRoutingScenario,type AiRoutingResult} from "@/server/ai/routing-contract";
import {testAiButlerRouting,setAiButlerRoutingHandoff} from "./ai-actions";
type Event={eventId:string;scenario:AiRoutingScenario};
const button="min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
export function AiRoutingPanel({initial}:{initial:{handoff:boolean;revision:number;globalStopped:boolean}}){
 const [local,setLocal]=useState({value:initial,baseRevision:initial.revision}),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[scenario,setScenario]=useState<AiRoutingScenario>("original"),[result,setResult]=useState<AiRoutingResult|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[uncertain,setUncertain]=useState(false),[hasLast,setHasLast]=useState(false);
 const state=initial.revision>local.baseRevision?initial:local.value;
 const setState=(value:typeof initial)=>setLocal({value,baseRevision:initial.revision});
 const pending=useRef<Event|null>(null),last=useRef<Event|null>(null);
 async function test(replay=false){
  const event=pending.current??(replay?last.current:{eventId:crypto.randomUUID(),scenario});
  if(!event)return;
  pending.current=event;setScenario(event.scenario);setUncertain(true);setBusy(true);setError("");setNotice("");setResult(null);
  try{const response=await testAiButlerRouting(event);if(response.success){pending.current=null;setUncertain(false);last.current=event;setHasLast(true);setResult(response.result);setState(response.state);}else setError(response.error);}
  catch{setError("連線中斷，結果尚未確認；重試沿用原事件，不重複建立測試。");}finally{setBusy(false);}
 }
 async function transfer(){
  setBusy(true);setError("");setNotice("");
  try{const response=await setAiButlerRoutingHandoff(!state.handoff);if(response.success){setState(response.state);setNotice(response.state.handoff?"已接手，原流程與 AI 自動回覆皆暫停。":"已恢復路由測試；AI 總停止與店家開關仍有效。");}else setError(response.error);}
  catch{setError("接手操作未確認，請重新核對。");}finally{setBusy(false);}
 }
 const labels:Record<AiRoutingResult["route"],string>={ORIGINAL:"原流程處理",AI:"AI 已發布知識",HUMAN:"轉真人",SILENT:"自動回覆已抑制",BLOCKED:"本次未執行自動回覆",DUPLICATE:"事件已處理，不重複執行"};
 return <section aria-label="原流程與 AI 路由測試" className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
  <SettingsListRow title="原流程與 AI 串接" summary={`${state.handoff?"真人接手中":"可進行合成測試"}・${state.globalStopped?"AI 總停止":"隔離 TEST"}`} expanded={expanded} keepMounted controls={<button type="button" className={button} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"收合串接測試":"展開串接測試"}</button>}>
   <div className="min-w-0 space-y-3 pb-4 text-sm">
    <p className="text-earth-600">只演練合成原流程與 Mock 知識回覆，不接真實通路、不呼叫 OpenAI。原流程命中或處理中不交給 AI，只有明確未命中才接續；真人接手後全部自動回覆暫停。</p>
    <label className="block space-y-1"><span>串接情境</span><select aria-label="串接情境" className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm" disabled={busy||uncertain} value={scenario} onChange={e=>{setScenario(e.target.value as AiRoutingScenario);setResult(null);setNotice("");}}>{Object.entries(AI_ROUTING_SCENARIOS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy} onClick={()=>test()}>{busy?"處理中…":uncertain?"重試原路由事件":"執行串接測試"}</button><button type="button" className={button} disabled={busy||!hasLast||uncertain} onClick={()=>test(true)}>重送上一事件</button><button type="button" className={button} disabled={busy||uncertain} onClick={transfer}>{state.handoff?"恢復路由測試":"模擬路由真人接手"}</button></div>
    {result&&<div role="status" className="space-y-2 break-words rounded-lg bg-earth-50 p-3"><p className="font-medium">{labels[result.route]}</p><p>模擬模型呼叫：{result.providerCalls} 次</p>{result.text&&<p className="whitespace-pre-wrap">{result.text}</p>}{result.outcome==="STOPPED"&&<p>AI 目前暫停，請核對總停止、店家開關或測試額度。</p>}{["RESULT_UNKNOWN","ROUTING_UNKNOWN"].includes(result.outcome)&&<p>原事件結果尚未確認，請先核對，不另建事件重試。</p>}{["BUSY","IN_PROGRESS"].includes(result.outcome)&&<p>上一事件仍在處理，請先核對原結果。</p>}</div>}
    {error&&<p role="alert" className="break-words text-red-700">{error}</p>}{notice&&<p role="status" className="break-words text-primary-700">{notice}</p>}
   </div>
  </SettingsListRow>
 </section>;
}
