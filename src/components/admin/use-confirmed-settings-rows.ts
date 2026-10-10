"use client";
import { useMemo, useState } from "react";

/** Keep confirmed writes through stale props; retire them once the server acknowledges them. */
export function useConfirmedSettingsRows<T extends {id?:string}>(source:T[], revision:(row:T)=>string) {
  const [receipts,setReceipts]=useState<T[]>([]);
  const [previousSource,setPreviousSource]=useState(source);
  if(previousSource!==source){
    setPreviousSource(source);
    const next=receipts.filter(row=>!source.some(current=>current.id===row.id&&revision(current)===revision(row)));
    if(next.length!==receipts.length)setReceipts(next);
  }
  const rows=useMemo(()=>{
    const combined=new Map(source.map(row=>[row.id,row]));
    for(const row of receipts)combined.set(row.id,row);
    return [...combined.values()];
  },[source,receipts]);
  function confirm(row:T){setReceipts(previous=>[...previous.filter(current=>current.id!==row.id),row]);}
  return {rows,confirm};
}
