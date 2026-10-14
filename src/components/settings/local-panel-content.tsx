"use client";
import {Component,Suspense,useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
type Receipt={storeId:string;panel:string;query:string;content:ReactNode};
class ContentBoundary extends Component<{children:ReactNode;retry:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div role="alert" className="p-6">設定讀取失敗，請重試或關閉視窗。<button type="button" className="ml-3 min-h-11 rounded border px-4" onClick={()=>{this.setState({failed:false});this.props.retry();}}>重新讀取</button></div>:this.props.children;}
}
/** Account/store scope comes from OperationScope; each returned receipt is checked again. */
export function LocalPanelContent({storeId,panel,query,initialKey,initialContent,read}:{storeId:string;panel:string;query:string;initialKey?:string;initialContent?:ReactNode;read:(storeId:string,panel:string,query:string)=>Promise<Receipt>}){
 const key=JSON.stringify([storeId,panel,query]);
 const [seed]=useState(()=>({key:initialKey,content:initialContent}));
 const reader=usePanelReader("settings-panel",read,storeId,0);
 const [seedFailed,setSeedFailed]=useState(false);
 const [result,setResult]=useState<{key:string;content?:ReactNode;error?:string}>();
 const currentRequest=useRef<{active:boolean}|null>(null);
 const load=useCallback(()=>{
  if(currentRequest.current)currentRequest.current.active=false;
  const token={active:true};currentRequest.current=token;
  const started=performance.now();
  void reader.read(storeId,panel,query).then(receipt=>{
   if(!token.active)return;
   if(receipt.storeId!==storeId||receipt.panel!==panel||receipt.query!==query)throw new Error("設定範圍已變更");
   setResult({key,content:receipt.content});
   console.info("[SETTINGS_PANEL_PERF]",{phase:"read",ms:Math.round(performance.now()-started)});
  }).catch(()=>{if(token.active)setResult({key,error:"設定讀取失敗，請重試。"});});
  return ()=>{token.active=false;};
 },[reader,storeId,panel,query,key]);
 useEffect(()=>{if(key!==seed.key||seedFailed)return load();},[key,seed.key,load,seedFailed]);
 if(key===seed.key&&!seedFailed)return <ContentBoundary key={key} retry={()=>setSeedFailed(true)}><Suspense fallback={<p role="status" className="p-6">正在讀取設定…</p>}>{seed.content}</Suspense></ContentBoundary>;
 if(result?.key!==key||(!("content" in result)&&!result.error))return <p role="status" className="p-6">正在讀取設定…</p>;
 if(result.error)return <div role="alert" className="p-6">{result.error}<button type="button" className="ml-3 min-h-11 rounded border px-4" onClick={()=>{setResult({key});load();}}>重新讀取</button></div>;
 return <ContentBoundary key={key} retry={()=>{reader.invalidate(storeId,panel,query);setResult({key});load();}}><Suspense fallback={<p role="status" className="p-6">正在讀取設定…</p>}>{result.content}</Suspense></ContentBoundary>;
}
