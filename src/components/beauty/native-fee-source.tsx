"use client";
import {CourseMonthlyReport,CourseMonthlyConfirm} from '@/app/(dashboard)/dashboard/service-fee-calculator/course-monthly-client';
import {useState} from "react";
import {confirmBeautyNativeSettlement} from "@/server/actions/beauty-native-transactions";
import type {SettlementLine} from '@/lib/course-monthly-settlement';
export function BeautyNativeFeeReport({storeId,lines,month,fingerprint,confirmed,previous,canConfirm}:{storeId:string;lines:SettlementLine[];month:string;fingerprint:string;confirmed:boolean;previous:boolean;canConfirm:boolean}){
 const [requests]=useState(()=>new Map<string,string>());
 return <CourseMonthlyReport detailsOnly feeLabel="技師拆帳" lines={lines} status={<span role="status" className={`rounded-full px-3 py-1 text-sm ${confirmed?'bg-primary-50 text-primary-800':'bg-amber-50 text-amber-900'}`}>{confirmed?'已確認':previous?'有異動':'待確認'}</span>} confirm={!confirmed&&canConfirm?<CourseMonthlyConfirm key={fingerprint} month={month} fingerprint={fingerprint} disabled={!lines.length} blockedReason={!lines.length?'本月沒有結算項目。':undefined} source={{confirmed:previous,save:input=>{if(!requests.has(input.fingerprint))requests.set(input.fingerprint,crypto.randomUUID());return confirmBeautyNativeSettlement({...input,expectedStoreId:storeId,requestKey:requests.get(input.fingerprint)!});}}}/>:undefined}/>;
}
