"use client";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {useMonthlyAdjustmentState} from "./monthly-adjustment-context";

/** The integrated detail list opens this one shared editor, retaining all server receipts. */
export function MonthlyAdjustmentRowActions({id,name}:{id:string;name:string}){
 const state=useMonthlyAdjustmentState(),row=state?.snapshot.rows.find(r=>r.id===id);
 if(!state||!row||state.snapshot.locked)return null;
 if(state.editor.pending)return <span className="inline-block h-11 w-11"/>;
 return <ExclusiveMenu quiet triggerText="⋯" label={`${name} 調整操作`}><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>state.openDraft({...row})}>編輯</button><button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>state.setDeleting(row)}>刪除</button></ExclusiveMenu>;
}
