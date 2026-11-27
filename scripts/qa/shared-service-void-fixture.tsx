// Local synthetic UI only. No database, messages, or financial writes.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BeautyNativeTransaction} from '../../src/components/beauty/native-transaction-source';
import {TransactionDrawer} from '../../src/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer';
import {PanelReadProvider} from '../../src/components/operations/panel-read-cache';
let voided=false;
window.qaAction=async(name)=>{
 if(name==='fetchTransactionDetailDTO')return {success:true,data:{id:'synthetic',customerId:'synthetic',customerName:'合成單次服務顧客',storeId:'synthetic',status:voided?'VOIDED':'SUCCESS',transactionType:'SINGLE_PURCHASE',paymentMethod:'CASH',paymentSplits:[],paymentStatus:'SUCCESS',amount:799,originalAmount:799,note:null,revenueStaffId:'synthetic',revenueStaffName:'合成店長',serviceStaffName:null,createdAt:'2026-11-18T08:00:00Z',transactionDate:'2026-11-18T08:00:00Z',voidedAt:voided?'2026-11-18T09:00:00Z':null,voidedByName:null,voidReason:null,customerPlanWallet:null,booking:{id:'synthetic',bookingDate:'2026-11-18T00:00:00Z',slotTime:'16:00',bookingStatus:voided?'PENDING':'COMPLETED'},auditLogs:[]}};
 if(name==='voidTransaction'||name==='voidBeautyNativeTransaction'){voided=true;return {success:true};}
 throw Error('Unexpected synthetic action '+name);
};
const order={id:'synthetic',name:'單次服務收款',customerName:'合成顧客',status:'CONFIRMED',price:799,paymentMethod:'CASH',note:'',revenueStaffId:null,voidReason:null,points:0,remaining:null,reserved:0,attended:0,usedQuota:0,unit:'MONEY',expiresAt:null,transferLastFive:'',refunds:[],servicePayment:true};
function Fixture(){const [steam,setSteam]=useState(false);return <PanelReadProvider><main className="p-4"><h1>單一作廢動作・合成介面驗收</h1><p>僅驗介面，不連資料庫。</p><button className="min-h-11 border p-3" onClick={()=>setSteam(true)}>蒸足單次交易</button><BeautyNativeTransaction storeId="synthetic" order={order} staffOptions={[]} canVoid canEdit={false} canRefund={false} canConfirm={false} cardAccess={false}/></main><TransactionDrawer open={steam} onClose={()=>setSteam(false)} transactionId="synthetic" staffOptions={[]} canVoid canEdit={false} canRefund={false}/></PanelReadProvider>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
