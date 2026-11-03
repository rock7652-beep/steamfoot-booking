"use client";
import {useEffect,useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {loadCourseCustomerTransaction} from "@/server/actions/course-customer-transaction";
import {CourseTransactionActions} from "../revenue/_components/course-transaction-actions";
type Success=Extract<Awaited<ReturnType<typeof loadCourseCustomerTransaction>>,{success:true}>;
export function CustomerTransactionAction({customerId,purchaseId,onUpdated,closeLabel}:{customerId:string;purchaseId:string;onUpdated?:()=>void;closeLabel?:string}){
 const params=useSearchParams(),reader=usePanelReader("customer-transaction",loadCourseCustomerTransaction,"",0);
 const [detail,setDetail]=useState<Success|null>(null),[pending,setPending]=useState(false),[error,setError]=useState("");
 const generation=useRef(0);
 useEffect(()=>()=>{++generation.current;},[customerId,purchaseId]);
 async function open(){
  if(pending)return;const version=++generation.current;setPending(true);setError("");
  try{const result=await reader.read({customerId,purchaseId,dataScope:params.get("dataScope")==="legacy"?"legacy":"operational"});if(version!==generation.current)return;if(result.success)setDetail(result);else setError(result.error);}
  catch{if(version===generation.current)setError("交易讀取失敗，請重試");}finally{if(version===generation.current)setPending(false);}
 }
 return <><button type="button" className="min-h-11 px-3 text-left text-sm text-primary-700 disabled:opacity-50" disabled={pending} onClick={open}>{pending?"讀取中…":"交易／退款"}</button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{detail&&<CourseTransactionActions initialOpen quiet closeLabel={closeLabel} order={detail.order} allocationSummary="" canRefund={detail.canRefund} canConfirm={detail.canConfirm} canEdit={detail.canEdit} canVoid={detail.canVoid} staffOptions={detail.staffOptions} onClosed={()=>setDetail(null)} onUpdated={onUpdated}/>}</>;
}
