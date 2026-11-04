import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import {MonthlyAdjustments} from '../../../src/app/(dashboard)/dashboard/service-fee-calculator/monthly-adjustments';
import '../../../src/app/globals.css';
import type {MonthlyAdjustment} from '../../../src/lib/staff-monthly-adjustment';
export const people=Array.from({length:25},(_,i)=>({id:`s${i}`,name:i===0?'王老師':i===1?'陳教練':i===2?'林技師':`測試人員 ${i+1}`,active:i!==24}));
export let rows:MonthlyAdjustment[]=Array.from({length:30},(_,i)=>({id:crypto.randomUUID(),staffId:`s${i%25}`,month:'2026-11',date:`2026-11-${String(i%28+1).padStart(2,'0')}`,direction:i%2?'SUBTRACT':'ADD',amount:i%2?300:2000,reason:i===2?'長事由測試：設備維修補償及金額計算依據，完整顯示不截斷。'.repeat(5):i%2?'出勤時數調整':'教學獎勵',revision:1}));
export let locked=false,revision=1;
export function notify(){window.dispatchEvent(new Event('fixture-change'));}
export async function saveMonthlyAdjustment(input:MonthlyAdjustment){
 if(input.reason==='測試失敗')return {success:false,error:'隔離測試：儲存失敗，內容已保留。'};
 const existing=rows.find(r=>r.id===input.id);if(existing)rows=rows.map(r=>r.id===input.id?{...input,revision:r.revision+1}:r);else rows=[...rows,{...input,revision:1}];revision++;notify();return {success:true,data:{storeId:"fixture",month:"2026-11",rows,locked,revision}};
}
export async function deleteMonthlyAdjustment(input:{id:string}){rows=rows.filter(r=>r.id!==input.id);revision++;notify();return {success:true,data:{storeId:"fixture",month:"2026-11",rows,locked,revision}};}
export async function changeAdjustmentMonthLock(input:{locked:boolean}){locked=input.locked;revision++;notify();return {success:true,data:{storeId:"fixture",month:"2026-11",rows,locked,revision}};}
function Fixture(){const [,update]=useState(0);useEffect(()=>{const changed=()=>update(x=>x+1);window.addEventListener('fixture-change',changed);return()=>window.removeEventListener('fixture-change',changed);},[]);return <main className="mx-auto max-w-6xl space-y-3 p-4 text-earth-900"><h1 className="text-xl">月結管理 · 2026 年 11 月</h1><p className="text-sm">隔離元件預覽，合成資料；不連線資料庫、不發送通知。</p><MonthlyAdjustments storeId="fixture" month="2026-11" rows={rows} people={people} canEdit={!new URLSearchParams(location.search).has('readonly')} locked={locked} revision={revision}/></main>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
