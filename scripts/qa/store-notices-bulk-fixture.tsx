// Isolated lifecycle UI fixture: no application routes, credentials or databases.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StoreNoticeBell} from '../../src/components/admin/store-notice-bell';
import {noticeSection} from '../../src/lib/store-notice-lifecycle';
import type {StoreNoticeItem} from '../../src/lib/store-notices';
import '../../src/app/globals.css';
let now=new Date('2026-11-01T12:00:00Z');
const ages=[0,24,48,72,9*24,10*24];
const names=['王小明','很長的顧客姓名與同行者需要換行','林小姐','歷史訊息三天','歷史訊息九天','已到期十天'];
let rows:StoreNoticeItem[]=names.map((customerName,i)=>({id:String(i),kind:'MOVE',customerName,courseName:'蒸足方案十堂',coachName:'值班店長',previousCoachName:null,startsAt:'2026-11-03T02:00:00Z',previousStartsAt:'2026-11-02T02:00:00Z',affectedCount:1,details:{},handledAt:i===2?now.toISOString():null,handledByName:i===2?'店長':null,revision:0,createdAt:new Date(now.getTime()-ages[i]*3600000).toISOString(),publishedAt:new Date(now.getTime()-ages[i]*3600000).toISOString(),updatedAt:now.toISOString(),targetId:'booking-'+i,canViewCourse:true}));
if(new URLSearchParams(location.search).has('receivable'))rows[0]={...rows[0],kind:'RECEIVABLE',amountDue:500};
const active=()=>rows.filter(r=>noticeSection(new Date(r.publishedAt!),now,r.handledAt)!=='expired');
const count=()=>active().filter(r=>!r.handledAt).length;
const load=async({storeId,handled,offset,summaryOnly}:{storeId:string;handled:boolean;offset:number;summaryOnly?:boolean})=>{
 const items=active().filter(r=>noticeSection(new Date(r.publishedAt!),now,r.handledAt)===(handled?'history':'latest'));
 return {success:true as const,storeId,enabled:true,items:summaryOnly?[]:items.slice(offset,offset+50),count:count(),canHandle:true,more:items.length>offset+50};
};
const mark=async({storeId,id,handled,revision}:{storeId:string;id:string;handled:boolean;revision:number})=>{
 const row=active().find(r=>r.id===id);if(!row||row.revision!==revision)return {success:false as const,error:'訊息已更新，請重新確認'};
 row.handledAt=handled?now.toISOString():null;row.handledByName=handled?'店長':null;row.revision++;
 return {success:true as const,storeId,data:{id,revision:row.revision,handledAt:row.handledAt,handledByName:row.handledByName}};
};
const markAll=async({storeId}:{storeId:string})=>{const changed=count();for(const row of active())if(!row.handledAt){row.handledAt=now.toISOString();row.handledByName='店長';row.revision++;}return {success:true as const,storeId,count:changed};};
(globalThis as typeof globalThis&{__advanceNoticeHours?:(hours:number)=>void}).__advanceNoticeHours=hours=>{now=new Date(now.getTime()+hours*3600000);window.dispatchEvent(new Event('focus'));};
const namespace=(new URLSearchParams(location.search).get('module')??'steamfoot') as 'steamfoot'|'course'|'beauty';
function Fixture(){const [target,setTarget]=useState('');return <main className="min-h-screen bg-earth-50 text-earth-800"><header className="flex items-center justify-between border-b bg-white px-4 py-2"><span>{namespace==='steamfoot'?'蒸足':namespace==='course'?'音樂／運動':'美業'}預約管理</span><StoreNoticeBell initialEnabled namespace={namespace} storeId="synthetic" loadNotices={load} markNotice={mark} markAllNotices={markAll} onViewTarget={n=>setTarget(n.targetId??'')}/></header><section className="space-y-4 p-4"><label>保留中的輸入<input aria-label="保留中的輸入" className="m-2 rounded border bg-white p-2" defaultValue="交班備註"/></label>{target&&<p role="status">查看預約：{target}</p>}</section></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
