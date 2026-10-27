"use client";
import {OperationsReceiptSummary} from "@/components/operations/receipt-summary";
import {useMusicRevenueLive} from "./music-revenue-live";
import {useEffect,useRef,useState} from "react";

import {usePanelReader} from "@/components/operations/panel-read-cache";
import {subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
type Totals={purchases:number;purchaseCount:number;trial:number;refunds:number;voids:number;gross:number;net:number};
type Input={from:string;to:string;dataScope?:string};
type Result={success:boolean;data?:Totals};
const unavailable:(input:Input)=>Promise<Result>=async()=>{throw new Error("preview only");};
const money=(value:number)=>`NT$ ${value.toLocaleString()}`;
/** Live financial figures have no TTL; the full transaction table refreshes separately. */
export function MusicRevenueMetrics({initial,from,to,dataScope,compact=false,pendingCount=0}:{compact?:boolean;pendingCount?:number;initial:Totals;from:string;to:string;dataScope?:string}){
 const live=useMusicRevenueLive();
 const coordinated=!!live;
 const [current,setCurrent]=useState<Totals|null>(null);
 const [status,setStatus]=useState("");
 const sequence=useRef(0);
 const reader=usePanelReader("revenue-totals",unavailable,"",0);
 useEffect(()=>{
  if(coordinated)return;
  let active=true;
  const read=async()=>{
   const version=++sequence.current;setStatus("更新收款合計中…");
   try{
    reader.invalidate({from,to,dataScope});
    const result=await reader.read({from,to,dataScope});
    if(!active||version!==sequence.current)return;
    if(!result.success||!result.data)throw new Error("read failed");
    setCurrent(result.data);setStatus("");
   }catch{if(active&&version===sequence.current)setStatus("收款合計更新失敗，請重新整理後核對。");}
  };
  const dispose=subscribeMusicFinanceChange(()=>{void read();});
  return()=>{active=false;dispose();};
 },[from,to,dataScope,reader,coordinated]);
 const totals=live?.data.totals??current??initial;
 const visibleStatus=live?.status??status;
 return <>
  {visibleStatus&&<p role="status" className="text-sm text-earth-600">{visibleStatus}</p>}
  {compact?<OperationsReceiptSummary gross={totals.gross} refunds={totals.refunds} net={totals.net} pendingCount={pendingCount}><p>核帳／收款及退款依發生日；清單依購買日期，體驗依建立日期。體驗沖銷 {money(totals.voids)}，皆為台灣時間。</p></OperationsReceiptSummary>:<p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">收款入帳合計 {money(totals.gross)} · 退款 {money(totals.refunds)} · 體驗沖銷 {money(totals.voids)} · <strong>淨收款 {money(totals.net)}</strong></p>}
 </>;
}
