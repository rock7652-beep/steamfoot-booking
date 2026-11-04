"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
import type {MonthlyAdjustmentSnapshot} from "@/lib/staff-monthly-adjustment";
import type {SettlementLine} from "@/lib/course-monthly-settlement";

type AdjustmentState = {
  snapshot:MonthlyAdjustmentSnapshot;
  people:{id:string;name:string}[];
  syncing:boolean;
  apply:(next:MonthlyAdjustmentSnapshot)=>boolean;
};
const AdjustmentContext=createContext<AdjustmentState|null>(null);

/** Keep confirmed mutation results visible while the larger RSC report refreshes. */
export function MonthlyAdjustmentProvider({initial,people,children,enabled=true}:{initial:MonthlyAdjustmentSnapshot;people:{id:string;name:string}[];children?:ReactNode;enabled?:boolean}) {
  const [receipt,setReceipt]=useState<MonthlyAdjustmentSnapshot|null>(null);
  // An older route response cannot overwrite a newer committed month revision.
  const snapshot=receipt&&receipt.storeId===initial.storeId&&receipt.month===initial.month&&receipt.revision>initial.revision?receipt:initial;
  return <AdjustmentContext.Provider value={enabled?{
    snapshot,people,syncing:snapshot.revision>initial.revision,
    apply(next){
      if(next.storeId!==initial.storeId||next.month!==initial.month)return false;
      setReceipt(current=>current&&current.revision>next.revision?current:next);
      return true;
    },
  }:null}>{children}</AdjustmentContext.Provider>;
}
export function useMonthlyAdjustmentState(){return useContext(AdjustmentContext);}

export function useAdjustmentReportLines(original:SettlementLine[]) {
  const state=useMonthlyAdjustmentState();
  if(!state)return original;
  const names=new Map(state.people.map(p=>[p.id,p.name]));
  return [...original.filter(l=>l.kind!=="ADJUSTMENT"),...state.snapshot.rows.map((r):SettlementLine=>({
    kind:"ADJUSTMENT",id:r.id,staffId:r.staffId,name:names.get(r.staffId)??"歷史人員",label:r.reason,
    date:`${r.date}T00:00:00+08:00`,amount:r.direction==="ADD"?r.amount:-r.amount,paid:0,issue:null,payments:[],
  }))];
}
