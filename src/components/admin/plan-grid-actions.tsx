"use client";
import {ExclusiveMenu} from "./exclusive-menu";

export type PlanGridAction = "BACKFILL" | "VOID" | "expiry" | "close";

/** Navigation only: every adjustment still requires its existing confirmation form. */
export function PlanGridActions({label="方案",disabled=false,allowExpiry=true,onSelect}:{
  label?:string;disabled?:boolean;allowExpiry?:boolean;onSelect:(action:PlanGridAction)=>void;
}) {
  const button="min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
  return <div className="flex flex-wrap items-center gap-2" aria-label={`${label} 快捷操作`}>
    <button type="button" className={button} disabled={disabled} onClick={()=>onSelect("BACKFILL")}>補登已上課</button>
    <button type="button" className={button} disabled={disabled} onClick={()=>onSelect("VOID")}>註銷堂數</button>
    <ExclusiveMenu label={`${label} 更多操作`} triggerText="⋯">
      {allowExpiry&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm disabled:opacity-50" disabled={disabled} onClick={()=>onSelect("expiry")}>調整期限</button>}
      <button type="button" className="min-h-11 w-full px-3 text-left text-sm text-red-700 disabled:opacity-50" disabled={disabled} onClick={()=>onSelect("close")}>註銷方案</button>
    </ExclusiveMenu>
  </div>;
}
