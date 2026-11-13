"use client";
import {ExclusiveMenu} from "./exclusive-menu";

export type PlanGridAction = "BACKFILL" | "VOID" | "expiry" | "close";

/** Navigation only: every adjustment still requires its existing confirmation form. */
export function PlanGridActions({label="方案",disabled=false,allowExpiry=true,allowSession=true,unitLabel="堂",onSelect}:{
  label?:string;disabled?:boolean;allowExpiry?:boolean;allowSession?:boolean;unitLabel?:string;onSelect:(action:PlanGridAction)=>void;
}) {
  const button="min-h-11 w-full px-3 text-left text-sm disabled:opacity-50";
  return <div className="flex justify-end" aria-label={`${label} 快捷操作`}>
    <ExclusiveMenu label={`${label} 更多操作`} triggerText="⋯">
      {allowSession&&<button type="button" className={button} disabled={disabled} onClick={()=>onSelect("BACKFILL")}>{unitLabel==="次"?"補登已服務":"補登已上課"}</button>}
      {allowSession&&<button type="button" className={button} disabled={disabled} onClick={()=>onSelect("VOID")}>{unitLabel==="次"?"註銷次數":"註銷堂數"}</button>}
      {allowExpiry&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm disabled:opacity-50" disabled={disabled} onClick={()=>onSelect("expiry")}>調整期限</button>}
      <button type="button" className="min-h-11 w-full px-3 text-left text-sm text-red-700 disabled:opacity-50" disabled={disabled} onClick={()=>onSelect("close")}>註銷方案</button>
    </ExclusiveMenu>
  </div>;
}
