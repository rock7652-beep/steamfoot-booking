"use client";
import { useActionState, useEffect, useRef } from "react";
import type { ReferralActionState } from "@/server/actions/subscription-referral";
export function ReferralActionForm({action,children,button,disabled=false}:{action:(previous:ReferralActionState,form:FormData)=>Promise<ReferralActionState>;children?:React.ReactNode;button:string;disabled?:boolean}){
  const formRef=useRef<HTMLFormElement>(null);
  const submitted=useRef<FormData|null>(null);
  async function submit(previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{
    submitted.current=form;
    try{return await action(previous,form);}catch{return {success:false,message:"連線中斷，結果尚未確認；請保留本頁並重試同一筆操作，系統會核對原紀錄。"};}
  }
  const [state,formAction,pending]=useActionState(submit,{success:false,message:""});
  useEffect(()=>{
    // React resets uncontrolled forms after a resolved action, including business failures.
    // Restore exactly the submitted draft and command ID; never invent a fresh retry command.
    if(state.success||!state.message||!submitted.current||!formRef.current)return;
    for(const element of Array.from(formRef.current.elements)){
      if(!(element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element instanceof HTMLTextAreaElement)||!element.name||element.name.startsWith("$ACTION_")||(element instanceof HTMLInputElement&&element.type==="file"))continue;
      const values=submitted.current.getAll(element.name).filter((value):value is string=>typeof value==="string");
      if(element instanceof HTMLInputElement&&(element.type==="checkbox"||element.type==="radio"))element.checked=values.includes(element.value);
      else element.value=values[0]??"";
    }
  },[state]);
  return <form ref={formRef} action={formAction} className="space-y-3"><fieldset disabled={pending||disabled} className="min-w-0 space-y-3">{children}<button type="submit" className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending?"核對與儲存中…":button}</button></fieldset>{state.message&&<p role={state.success?"status":"alert"} className={state.success?"text-base text-green-800":"text-base text-red-700"}>{state.message}</p>}</form>;
}
