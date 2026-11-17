import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {CustomerMessageSelectionProvider,CustomerMessageActions,CustomerMessageSingleLink,useCustomerMessageSelection} from "../../src/components/customer-message-entry";
import {CustomerMessageComposer} from "../../src/app/(dashboard)/dashboard/customers/messages/composer";
import {usePathname,useSearchParams} from "./customer-message-entry-navigation";
import {people} from "./customer-messages-actions";
import "../../src/app/globals.css";
const base="/s/synthetic/admin/dashboard/customers";
function List(){const [ids,setIds]=useState<Set<string>>(new Set()),[person,setPerson]=useState("");const enabled=useCustomerMessageSelection(ids);return <>
 <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl">顧客管理</h1><CustomerMessageActions/></header>
 {people.slice(0,3).map(p=><div className="flex min-h-14 items-center gap-3 border-b p-2" key={p.id}>{enabled&&<input aria-label={`選取 ${p.name}`} type="checkbox" checked={ids.has(p.id)} onChange={()=>setIds(old=>{const next=new Set(old);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}/>}<button className="min-h-11 px-2" onClick={()=>setPerson(p.id)}>{p.name}</button></div>)}
 {person&&<section aria-label="顧客詳情" className="mt-4 rounded-xl border p-4"><h2>{people.find(p=>p.id===person)?.name}</h2><CustomerMessageSingleLink customerId={person}/></section>}
 </>;}
function App(){const path=usePathname(),params=useSearchParams();const historyOnly=params.get("view")==="history";return <main className="mx-auto max-w-6xl p-4 sm:p-6">{path.endsWith("/messages")?<><h1 className="mb-4 text-2xl">{historyOnly?"發送紀錄":"發送訊息"}</h1><a href={base} className="mb-4 inline-flex min-h-11 items-center">返回顧客管理</a><CustomerMessageComposer key={path+params.toString()} options={{storeId:"demo-store",storeName:"示範店",labels:[],staff:[],blocker:"隔離預覽，不會外發"}} initial={{rows:people.slice(0,25),total:people.length,page:1}} initialHistory={[]} historyOnly={historyOnly} selectionToken={params.get("selection")??""} initialSelected={params.get("customerId")?people.filter(p=>p.id===params.get("customerId")):[]}/></>:<CustomerMessageSelectionProvider storeId="demo-store" enabled={!params.has("readonly")}><List/></CustomerMessageSelectionProvider>}</main>;}
createRoot(document.getElementById("root")!).render(<App/>);
