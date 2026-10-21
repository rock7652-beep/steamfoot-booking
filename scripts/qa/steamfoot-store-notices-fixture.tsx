// Synthetic UI only: no application routes, credentials or database access.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {StoreNoticeBell} from "../../src/components/admin/store-notice-bell";
import {SteamfootNoticeSetting} from "../../src/components/admin/steamfoot-notice-setting";
import type {StoreNoticeItem} from "../../src/lib/store-notices";
import "../../src/app/globals.css";
const state=globalThis as typeof globalThis&{__noticeEnabled?:boolean;__failNotice?:boolean};state.__noticeEnabled=true;
const names=["王小明","很長的顧客姓名與同行者需要換行","林小姐"];
let rows:StoreNoticeItem[]=names.map((customerName,i)=>({id:String(i),kind:i===0?"MOVE":i===1?"CANCEL":"NO_SHOW",customerName,courseName:"蒸足方案十堂",coachName:"值班店長",previousCoachName:null,startsAt:"2030-01-11T02:00:00Z",previousStartsAt:i===0?"2030-01-10T02:00:00Z":null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:0,createdAt:"2030-01-10T02:00:00Z",updatedAt:"2030-01-10T02:00:00Z",targetId:"booking-"+i,canViewCourse:true}));
const load=async({storeId,handled,summaryOnly}:{storeId:string;handled:boolean;summaryOnly?:boolean})=>({success:true as const,storeId,enabled:state.__noticeEnabled??true,items:summaryOnly?[]:rows.filter(r=>!!r.handledAt===handled),count:rows.filter(r=>!r.handledAt).length,canHandle:true,more:false});
const mark=async({storeId,id,handled,revision}:{storeId:string;id:string;handled:boolean;revision:number})=>{
 if(state.__failNotice)return {success:false as const,error:"儲存失敗，已恢復"};
 const row=rows.find(r=>r.id===id)!;if(row.revision!==revision)return {success:false as const,error:"通知已更新"};
 row.handledAt=handled?"2030-01-10T03:00:00Z":null;row.handledByName=handled?"值班店長":null;row.revision++;rows=[...rows];
 return {success:true as const,storeId,data:{id,revision:row.revision,handledAt:row.handledAt,handledByName:row.handledByName}};
};
function Fixture(){const [target,setTarget]=useState("");return <main className="min-h-screen bg-earth-50 text-earth-800"><header className="flex flex-wrap items-center justify-between border-b bg-white px-4 py-2"><span>蒸足預約管理</span><StoreNoticeBell initialEnabled namespace="steamfoot" storeId="synthetic" loadNotices={load} markNotice={mark} onViewTarget={n=>setTarget(n.targetId??"")}/></header><section className="space-y-4 p-4"><h1>通知與顧客經營</h1><SteamfootNoticeSetting storeId="synthetic" initialEnabled canEdit/><label>保留中的輸入<input aria-label="保留中的輸入" className="m-2 rounded border bg-white p-2" defaultValue="交班備註"/></label>{target&&<p role="status">查看預約：{target}</p>}</section></main>;}
createRoot(document.getElementById("root")!).render(<Fixture/>);
