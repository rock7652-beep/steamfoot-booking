"use client";
import {useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {payCourseFee,correctCourseFee} from "@/server/actions/course-fee-payment";

export function CourseFeePaymentButton({sessionId, amount}: {sessionId:string; amount:number}) {
  const [open,setOpen]=useState(false), [method,setMethod]=useState<"CASH"|"OTHER">("OTHER");
  const [note,setNote]=useState(""), [requestKey,setRequestKey]=useState(""), [error,setError]=useState("");
  const [pending,start]=useTransition();
  const router=useRouter();
  if(!open) return <button className="min-h-11 text-primary-700" onClick={()=>{setRequestKey(crypto.randomUUID());setOpen(true);}}>登錄已付</button>;
  return <form className="min-w-48 space-y-2" onSubmit={event=>{event.preventDefault();start(async()=>{
    setError("");
    try {
      const result=await payCourseFee({sessionId,expectedAmount:amount,method,note,requestKey});
      if(!result.success){setError(result.error);return;}
      setOpen(false);router.refresh();
    } catch {setError("連線未完成，請重試；同一筆不會重複入帳。");}
  });}}>
    <p>確認已支付 NT$ {amount.toLocaleString()}。此處僅登錄，不會自動匯款。</p>
    <label className="block">付款方式<select disabled={pending} className="block min-h-11 border" value={method} onChange={e=>setMethod(e.target.value as "CASH"|"OTHER")}><option value="OTHER">轉帳／其他非現金</option><option value="CASH">現金</option></select></label>
    <label className="block">付款備註<input disabled={pending} className="block min-h-11 border" value={note} maxLength={500} required onChange={e=>setNote(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}
    <button disabled={pending||!note.trim()} className="min-h-11 rounded bg-primary-700 px-3 text-white">{pending?"處理中…":"確認登錄"}</button>
    <button type="button" disabled={pending} className="min-h-11 px-3" onClick={()=>setOpen(false)}>取消</button>
  </form>;
}

export function CourseFeeCorrectionButton({paymentId}:{paymentId:string}) {
  const [open,setOpen]=useState(false), [reason,setReason]=useState(""), [error,setError]=useState("");
  const [pending,start]=useTransition();const router=useRouter();
  if(!open)return <button className="min-h-11 text-primary-700" onClick={()=>setOpen(true)}>更正誤登</button>;
  return <form className="space-y-2" onSubmit={e=>{e.preventDefault();start(async()=>{
    setError("");try{const result=await correctCourseFee({paymentId,reason});if(!result.success){setError(result.error);return;}setOpen(false);router.refresh();}catch{setError("連線未完成，請重試；不會重複沖回。");}
  });}}><p>僅更正誤登紀錄，保留原付款及沖回。不代表已向教練收回款項。</p>
    <label>更正原因<input className="block min-h-11 border" required maxLength={500} disabled={pending} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {error&&<p role="alert">{error}</p>}<button className="min-h-11 px-3" disabled={pending||!reason.trim()}>確認更正</button><button className="min-h-11 px-3" type="button" disabled={pending} onClick={()=>setOpen(false)}>取消</button>
  </form>;
}
