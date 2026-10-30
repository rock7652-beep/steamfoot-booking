"use client";
import {useEffect,useState,type ComponentProps} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {readSportsScheduleOptions} from "@/lib/sports-schedule-options-client";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import {SportsScheduleFields} from "./sports-schedule-fields";

type Props = Omit<ComponentProps<typeof SportsScheduleFields>,"initial"> & {
  initial?:SportsSnapshot;
  scopeVersion:string;
  addedCustomers:SportsSnapshot["customers"];
};
/** Mounted only inside the open dialog. Once initialized, background refresh cannot replace drafts. */
export function SportsScheduleLoader({initial,scopeVersion,addedCustomers,...props}:Props) {
  const reader = usePanelReader("sports-schedule-options",readSportsScheduleOptions,scopeVersion,0);
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
  if (!data) return <div className="min-w-0 space-y-3 p-4" aria-busy={!error}>
    {error?<><p role="alert">{error}</p><button type="button" className="min-h-11 rounded-lg border border-earth-200 px-4" onClick={()=>{reader.clear();setError("");setAttempt(n=>n+1);}}>重新讀取</button></>:<p role="status">正在讀取排課資料…</p>}
  </div>;
  const customers = [...new Map([...data.customers,...addedCustomers].map(customer=>[customer.id,customer])).values()];
  return <SportsScheduleFields {...props} initial={{...data,customers}}/>;
}
