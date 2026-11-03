"use client";
import { useActionState } from "react";
import { applyMusicOperationalPilot } from "@/server/actions/music-operational-pilot";
export function PilotCommit({imported}:{imported:boolean}){
  const [state,action,pending]=useActionState(applyMusicOperationalPilot,{success:false,message:""});
  return <form action={action} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
    <label className="flex min-h-11 items-center gap-2"><input name="confirmed" type="checkbox" value="yes" required disabled={pending}/>確認本次十人樣本，僅寫入隔離測試站</label>
    <button type="submit" disabled={pending} className="min-h-11 rounded bg-primary-700 px-4 text-white disabled:opacity-50">{pending?"核對與寫入中…":imported?"核對已匯入批次":"銜接已核對樣本"}</button>
    {state.message&&<p role="status" className={state.success?"text-green-700":"text-red-700"}>{state.message}</p>}
  </form>;
}
