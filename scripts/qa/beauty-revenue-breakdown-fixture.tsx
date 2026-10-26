// Actual report view and shared table/filter components; no backend imports or writes.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyRevenueBreakdownView} from '../../src/components/beauty/revenue-breakdown-view';
import {beautyRevenueBreakdown} from '../../src/lib/beauty/revenue-breakdown';
const source=[{staffId:'manager-a',coachName:'合成所屬店長甲（長姓名與分店識別）',netAmount:5000,refund:false,saleAllocation:{storeAmount:1000,managerAmount:4000,unassignedAmount:0,unknownAmount:0}},{staffId:'manager-a',coachName:'合成所屬店長甲（長姓名與分店識別）',netAmount:-300,refund:true,saleAllocation:{storeAmount:-60,managerAmount:-240,unassignedAmount:0,unknownAmount:0}},{staffId:null,coachName:null,netAmount:500,refund:false,saleAllocation:{storeAmount:100,managerAmount:0,unassignedAmount:400,unknownAmount:0}},{staffId:'manager-b',coachName:'合成所屬店長乙',netAmount:600,refund:false,saleAllocation:{storeAmount:0,managerAmount:0,unassignedAmount:0,unknownAmount:600}}];
window.qaCalls=[];window.qaAction=async name=>{throw Error('Unexpected backend action '+name);};
function Fixture(){const [view,setView]=useState('normal');const data={storeId:'synthetic',storeName:'合成美業店',from:'2026-10-01',to:'2026-10-31',...beautyRevenueBreakdown(view==='empty'?[]:source),...(view==='difference'?{hasDifferences:true}:{}),technicians:view==='denied'?null:view==='empty'?[]:[{id:'tech-a',name:'合成技師甲',services:3,fee:1500,paid:900,unpaid:600,overpaid:0},{id:'tech-b',name:'合成技師乙',services:1,fee:500,paid:550,unpaid:0,overpaid:50}]};
 return <OperationScope scope="qa:beauty:revenue"><main className="min-w-0 p-3"><label>驗收情境<select aria-label="驗收情境" value={view} onChange={e=>setView(e.target.value)}><option value="normal">完整分類</option><option value="denied">無薪酬權限</option><option value="empty">空期間</option><option value="difference">分配差額</option></select></label><BeautyRevenueBreakdownView data={data}/></main></OperationScope>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
