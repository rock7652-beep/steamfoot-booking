"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
import type {RevenueTransactions,RevenueTransactionsInput} from "@/server/queries/music-revenue-transactions";
import type {getCourseReceiptTotals} from "@/server/queries/course-home";

type Snapshot={totals:Awaited<ReturnType<typeof getCourseReceiptTotals>>;transactions:RevenueTransactions};
type Timing={authMs:number;totalsMs:number;transactionsMs:number;totalMs:number};
type Result={success:boolean;data?:Snapshot;timing?:Timing};
const unavailable=async (_input:RevenueTransactionsInput):Promise<Result>=>{throw new Error("preview only");};
const Context=createContext<{data:Snapshot;status:string}|null>(null);
export const useMusicRevenueLive=()=>useContext(Context);

/** One authorized request per signal. No persistent financial cache or optimistic amounts. */
export function MusicRevenueLive({initial,input,enabled,children}:{initial:Snapshot;input:RevenueTransactionsInput;enabled:boolean;children:ReactNode}){
 const [current,setCurrent]=useState<Snapshot|null>(null),[status,setStatus]=useState("");
 const sequence=useRef(0);
 const reader=usePanelReader("revenue-snapshot",unavailable,"",0);
 const {from,to,dataScope,status:filterStatus,staff,page}=input;
 useEffect(()=>{
  if(!enabled)return;
  let active=true;
  const dispose=subscribeMusicFinanceChange(()=>{
   const version=++sequence.current,started=performance.now();
   const args={from,to,dataScope,status:filterStatus,staff,page};
   setStatus("更新營收中…");reader.invalidate(args);
   void reader.read(args).then(result=>{
    if(!active||version!==sequence.current)return;
    if(!result.success||!result.data)throw new Error("read failed");
    setCurrent(result.data);setStatus("營收已同步");
    console.info("[music-revenue-refresh]",JSON.stringify({requestMs:Math.round(performance.now()-started),...result.timing}));
   }).catch(()=>{if(active&&version===sequence.current)setStatus("營收更新失敗，請重新整理後核對。");});
  });
  return()=>{active=false;++sequence.current;dispose();};
 },[enabled,from,to,dataScope,filterStatus,staff,page,reader]);
 return <Context.Provider value={enabled?{data:current??initial,status}:null}>{children}</Context.Provider>;
}
