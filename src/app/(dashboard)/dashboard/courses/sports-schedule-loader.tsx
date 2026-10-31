"use client";
import {useEffect,useState,type ComponentProps} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {readSportsScheduleOptions,SPORTS_SCHEDULE_OPTIONS_TTL} from "@/lib/sports-schedule-options-client";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import {SportsScheduleFields} from "./sports-schedule-fields";

type Props = Omit<ComponentProps<typeof SportsScheduleFields>,"initial"> & {
  initial?:SportsSnapshot;
  preview?:SportsSnapshot;
  scopeVersion:string;
  addedCustomers:SportsSnapshot["customers"];
};
/** Mounted only inside the open dialog. Once initialized, background refresh cannot replace drafts. */
export function SportsScheduleLoader({initial,preview,scopeVersion,addedCustomers,...props}:Props) {
  const reader = usePanelReader("sports-schedule-options",readSportsScheduleOptions,scopeVersion,SPORTS_SCHEDULE_OPTIONS_TTL);
  const [data,setData] = useState(initial);
  const [error,setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    if (data) return;
    let active = true;
    reader.read().then(result=>{
      if (!active) return;
      if (result.success) setData(result.data);
      else setError(result.error);
    }).catch(()=>{if(active)setError("無法讀取排課資料，請重試。");});
    return ()=>{active=false;reader.clear();};
  },[reader,data,attempt]);
  const status=(!data||preview)&&<div className={preview?"min-h-5 min-w-0 text-sm":"min-w-0 space-y-3 p-4"} aria-busy={!data&&!error}>
    {data?<p className="h-5" aria-hidden="true"/>:error?<><p role="alert">{error}</p><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-4" onClick={()=>{reader.clear();setError("");setAttempt(n=>n+1);}}>重新讀取</button></>:<p role="status">正在讀取排課資料…</p>}
  </div>;
  const shown=data??preview;
  if(!shown)return status;
  const customers = [...new Map([...shown.customers,...addedCustomers].map(customer=>[customer.id,customer])).values()];
  return <>{status}<SportsScheduleFields {...props} metadataPending={!data} initial={{...shown,customers}}/></>;
}
