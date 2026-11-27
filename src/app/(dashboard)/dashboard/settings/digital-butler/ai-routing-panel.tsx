"use client";
import {useRef,useState,useSyncExternalStore} from "react";
import {SettingsListRow} from "@/components/settings/settings-workspace";
import {AI_ROUTING_SCENARIOS,type AiRoutingScenario,type AiRoutingResult} from "@/server/ai/routing-contract";
import {testAiButlerRouting,testAiButlerLineSynthetic,setAiButlerRoutingHandoff} from "./ai-actions";
import {useAiHandoffWorkspace} from "./ai-handoff-workspace";
type Event={eventId:string;scenario:AiRoutingScenario;provider?:"mock"|"openai"};
const button="min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
const subscribeReady=()=>()=>{};
const clientReady=()=>true,serverReady=()=>false;
export function AiRoutingPanel({initial,line=false,liveTestAvailable=false}:{initial:{handoff:boolean;revision:number;globalStopped:boolean};line?:boolean;liveTestAvailable?:boolean}){
 const ready=useSyncExternalStore(subscribeReady,clientReady,serverReady);
 const [provider,setProvider]=useState<"mock"|"openai">("mock");
 const [local,setLocal]=useState({value:initial,baseRevision:initial.revision}),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[scenario,setScenario]=useState<AiRoutingScenario>("original"),[result,setResult]=useState<AiRoutingResult|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[uncertain,setUncertain]=useState(false),[hasLast,setHasLast]=useState(false);
 const workspace=useAiHandoffWorkspace()?.snapshot;
 const shared=line?workspace?.lineRouting:workspace?.routing;
 const external=shared&&shared.revision>initial.revision?shared:initial;
 const state=external.revision>local.value.revision?external:local.value;
 const setState=(value:typeof initial)=>setLocal({value,baseRevision:external.revision});
 const pending=useRef<Event|null>(null),last=useRef<Event|null>(null);
 async function test(replay=false){
  const event=pending.current??(replay?last.current:{eventId:crypto.randomUUID(),scenario,...(line?{provider}:{})});
  if(!event)return;
  pending.current=event;setScenario(event.scenario);if(event.provider)setProvider(event.provider);setUncertain(true);setBusy(true);setError("");setNotice("");setResult(null);
  try{const response=line?await testAiButlerLineSynthetic({...event,provider:event.provider??"mock"}):await testAiButlerRouting({eventId:event.eventId,scenario:event.scenario});if(response.success){pending.current=null;setUncertain(false);last.current=event;setHasLast(true);setResult(response.result);setState(response.state);}else setError(response.error);}
  catch{setError("連線中斷，結果尚未確認；重試沿用原事件，不重複建立測試。");}finally{setBusy(false);}
 }
 async function transfer(){
  setBusy(true);setError("");setNotice("");
  try{const response=await setAiButlerRoutingHandoff(!state.handoff);if(response.success){setState(response.state);setNotice(response.state.handoff?"已接手，原流程與 AI 自動回覆皆暫停。":"已恢復路由測試；AI 總停止與店家開關仍有效。");}else setError(response.error);}
  catch{setError("接手操作未確認，請重新核對。");}finally{setBusy(false);}
 }
 const labels:Record<AiRoutingResult["route"],string>={ORIGINAL:"原流程處理",AI:"AI 已發布知識",HUMAN:"轉真人",SILENT:"自動回覆已抑制",BLOCKED:"本次未執行自動回覆",DUPLICATE:"事件已處理，不重複執行"};
 return <section aria-label={line?"合成 LINE 對話演練":"原流程與 AI 路由測試"} className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
  <SettingsListRow title={line?"合成 LINE 對話演練":"原流程與 AI 串接"} summary={`${state.handoff?"真人接手中":"可進行合成測試"}・${state.globalStopped?"AI 總停止":"隔離 TEST"}`} expanded={expanded} keepMounted controls={<button type="button" className={button} disabled={!ready} aria-busy={!ready} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{line?(expanded?"收合 LINE 演練":"展開 LINE 演練"):(expanded?"收合串接測試":"展開串接測試")}</button>}>
   <div className="min-w-0 space-y-3 pb-4 text-sm">
    <p className="text-earth-600">{line?"只使用固定合成訊息。可選 Mock 或真實 OpenAI，結果只顯示於此，不連正式 LINE、不外發訊息。轉真人後，請在 AI 待人工處理核對並明確確認恢復；切換模型不會解除接手。":"只演練合成原流程與 Mock 知識回覆，不接真實通路、不呼叫 OpenAI。原流程命中或處理中不交給 AI，只有明確未命中才接續；真人接手後全部自動回覆暫停。"}</p>
    {line&&<label className="block space-y-1"><span>演練模型</span><select aria-label="演練模型" className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm" disabled={busy||uncertain} value={provider} onChange={e=>{setProvider(e.target.value as "mock"|"openai");setResult(null);}}><option value="mock">Mock（不呼叫 API）</option>{liveTestAvailable&&<option value="openai">真實 OpenAI（計入測試額度）</option>}</select></label>}
    <label className="block space-y-1"><span>串接情境</span><select aria-label="串接情境" className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm" disabled={busy||uncertain} value={scenario} onChange={e=>{setScenario(e.target.value as AiRoutingScenario);setResult(null);setNotice("");}}>{Object.entries(AI_ROUTING_SCENARIOS).map(([value,label])=><option key={value} value={value}>{line&&value==="known"?"未命中，詢問已發布營業時間":label}</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy} onClick={()=>test()}>{busy?"處理中…":uncertain?"重試原路由事件":"執行串接測試"}</button><button type="button" className={button} disabled={busy||!hasLast||uncertain} onClick={()=>test(true)}>重送上一事件</button>{!line&&<button type="button" className={button} disabled={busy||uncertain} onClick={transfer}>{state.handoff?"恢復路由測試":"模擬路由真人接手"}</button>}</div>
    {result&&<div role="status" className="space-y-2 break-words rounded-lg bg-earth-50 p-3"><p className="font-medium">{labels[result.route]}</p><p>{line?(provider==="openai"?"OpenAI 模型呼叫":"Mock 模型呼叫"):"模擬模型呼叫"}：{result.providerCalls} 次</p>{result.text&&<p className="whitespace-pre-wrap">{result.text}</p>}{result.outcome==="STOPPED"&&<p>AI 目前暫停，請核對總停止、店家開關或測試額度。</p>}{["RESULT_UNKNOWN","ROUTING_UNKNOWN"].includes(result.outcome)&&<p>原事件結果尚未確認，請先核對，不另建事件重試。</p>}{["BUSY","IN_PROGRESS"].includes(result.outcome)&&<p>上一事件仍在處理，請先核對原結果。</p>}</div>}
    {error&&<p role="alert" className="break-words text-red-700">{error}</p>}{notice&&<p role="status" className="break-words text-primary-700">{notice}</p>}
   </div>
  </SettingsListRow>
 </section>;
}
