"use client";
import {useMusicRevenueLive} from "@/components/admin/music-revenue-live";
import {useEffect,useRef,useState} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {subscribeMusicFinanceChange} from "@/lib/music-finance-sync";
import {DataTable,EmptyRow,type Column} from "@/components/desktop";
import {DashboardLink as Link} from "@/components/dashboard-link";
import {CourseTransactionActions} from "./course-transaction-actions";
import {courseAllocationAfterRefund} from "@/lib/course-sale-allocation";
import type {RevenueTransactions,RevenueTransactionsInput} from "@/server/queries/music-revenue-transactions";
type Result={success:boolean;data?:RevenueTransactions};
const unavailable=async (_input:RevenueTransactionsInput):Promise<Result>=>{throw new Error("preview only");};
const money=(n:number)=>`NT$ ${n.toLocaleString()}`;
export function CourseRevenueTransactions({initial,input,staffRows,basePath,live,canRefund,canConfirm,canEdit,canVoid}:{
 initial:RevenueTransactions;input:RevenueTransactionsInput;staffRows:{id:string;userId:string|null;displayName:string;status:string}[];basePath:string;live:boolean;canRefund:boolean;canConfirm:boolean;canEdit:boolean;canVoid:boolean;
}){
 const coordinated=useMusicRevenueLive();
 const hasCoordinator=!!coordinated;
 const [current,setCurrent]=useState<RevenueTransactions|null>(null),[sync,setSync]=useState("");
 const reader=usePanelReader("revenue-transactions",unavailable,"",0);
 const sequence=useRef(0);
 const {from,to,status,staff,page:requestedPage,dataScope}=input;
 useEffect(()=>{
  if(!live||hasCoordinator)return;
  let active=true;
  const dispose=subscribeMusicFinanceChange(()=>{
   const version=++sequence.current;
   const args={from,to,status,staff,page:requestedPage,dataScope};
   setSync("更新交易明細中…");reader.invalidate(args);
   void reader.read(args).then(result=>{
    if(!active||version!==sequence.current)return;
    if(!result.success||!result.data)throw new Error("read failed");
    setCurrent(result.data);setSync("交易明細已同步");
   }).catch(()=>{if(active&&version===sequence.current)setSync("交易明細更新失敗，請重新整理後核對。");});
  });
  return()=>{active=false;++sequence.current;dispose();};
 },[live,from,to,status,staff,requestedPage,dataScope,reader,hasCoordinator]);
 const {rows,count,pages,page}=coordinated?.data.transactions??current??initial;
 const scopeQuery:Record<string,string>=dataScope==="legacy"?{dataScope:"legacy"}:{};
 const labels:Record<string,string>={PENDING:"待核帳",CONFIRMED:"已核帳並發卡",REFUNDED:"已登錄退款",VOIDED:"已作廢"};
  const columns: Column<(typeof rows)[number]>[] = [
    { key: "date", header: "購買日期", accessor: (r) => r.date },
    { key: "customer", header: "顧客", accessor: (r) => <span className="block max-w-32 truncate" title={r.customerName}>{r.customerName}</span> },
    { key: "plan", header: "方案", accessor: (r) => <span className="block max-w-32 truncate" title={r.name}>{r.name}</span> },
    { key: "amount", header: "累計實收", align: "right", accessor: (r) => <span className="whitespace-nowrap">{money(r.price)}{r.tuitionDue!==undefined&&<span className="block text-sm text-earth-600">應收 {money(r.tuitionDue)} · 未收 {money(r.status==="CONFIRMED"?r.tuitionDue-r.price:0)}</span>}</span> },
    { key: "status", header: "狀態", accessor: (r) => <span className="whitespace-nowrap">{labels[r.status] ?? "需核對"}</span> },
    { key: "staff", header: "核帳人員", accessor: (r) => {const name=staffRows.find((s) => s.userId === r.confirmedBy)?.displayName ?? "—";return <span className="block max-w-28 truncate whitespace-nowrap" title={name}>{name}</span>;} },
    { key: "action", header: "處理", noLink: true, accessor: (r) => {const allocation=r.storeCostSnapshot==null?"舊交易待補":r.status==="VOIDED"?"已作廢":(()=>{const a=courseAllocationAfterRefund(r.price,r.storeCostSnapshot,r.refunds.reduce((n,v)=>n+v.amount,0));return `店家 NT$ ${a.storeAmount.toLocaleString()}／開發人 NT$ ${a.developerAmount.toLocaleString()}`;})();return <CourseTransactionActions order={r} allocationSummary={allocation} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid&&r.tuitionDue===undefined} staffOptions={staffRows.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.displayName }))} />;} },
  ];
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...scopeQuery, dateFrom: from, dateTo: to, status: status ?? "", staff: staff ?? "", page: String(p) })}`;
 return <>
<p className="p-3 text-sm text-earth-600">共 {count} 筆購買紀錄{sync&&<span role="status"> · {sync}</span>}</p>
      {rows.length ? <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} className="rounded-none border-0 [&_th]:whitespace-nowrap [&_th]:py-2" /> : <EmptyRow title="沒有符合條件的交易" hint="調整日期或篩選條件重新查詢" />}
      {pages > 1 && <div className="flex justify-between p-3 text-sm"><span>第 {page} / {pages} 頁</span><div className="flex gap-4">{page > 1 && <Link href={href(page - 1)}>上一頁</Link>}{page < pages && <Link href={href(page + 1)}>下一頁</Link>}</div></div>}
 </>;
}
