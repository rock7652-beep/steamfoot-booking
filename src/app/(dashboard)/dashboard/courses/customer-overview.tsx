"use client";
import type {ReactNode} from "react";
import {CustomerPhoneLink} from "@/components/customer-detail-fields";
import {CustomerLabels} from "@/components/customer-labels";

/** The original customer overview; module-specific records and writes are injected. */
export function CourseCustomerOverview({id,phone,canEdit,compact=false,attribution,details,note,cards,connection,advanced,actions}:{id:string;phone:string;canEdit:boolean;compact?:boolean;attribution?:ReactNode;details?:ReactNode;note?:ReactNode;cards?:ReactNode;connection?:ReactNode;advanced?:ReactNode;actions?:ReactNode}){
 return <section className="space-y-3">
  <div aria-label="顧客基本資料" className={compact?"grid grid-cols-1 items-start gap-x-5 sm:grid-cols-2":"contents"}>
   <CustomerPhoneLink phone={phone}/><CustomerLabels customerId={id} readOnly={!canEdit} maxVisible={5}/>
   {compact&&<div className="sm:col-span-2">{attribution}{details}</div>}
  </div>
  {note}{!compact&&attribution}{cards}{connection}{advanced}{!compact&&details}{actions}
 </section>;
}
