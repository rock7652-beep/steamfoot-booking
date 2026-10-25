// Local shared transaction panel Preview. No backend or database writes.
import {createRoot} from 'react-dom/client';
import {OperationScope} from '../../src/components/operations/operation-scope';
import {BeautyNativeTransaction} from '../../src/components/beauty/native-transaction-source';
import {beautyAllocationSummary} from '../../src/lib/beauty/sale-allocation';
declare global{interface Window{qaAction:(name:string,...args:unknown[])=>Promise<unknown>}}
window.qaAction=async()=>{throw Error('Writes are disabled in this read-only Preview');};
const order={id:'synthetic-receipt',name:'合成按摩方案',customerName:'驗收顧客',status:'CONFIRMED',price:900,points:5,remaining:5,reserved:0,attended:0,usedQuota:0,unit:'SESSION',expiresAt:'2026-12-31',transferLastFive:'',paymentMethod:'CASH',note:'合成資料',revenueStaffId:'synthetic-manager',voidReason:null,storeCostSnapshot:300,refunds:[{amount:300,reason:'合成部分退款',date:'2026-10-26',method:'CASH'}]};
createRoot(document.getElementById('root')!).render(<OperationScope scope="qa:beauty:money"><main className="p-4"><h1>營運分配驗收</h1><BeautyNativeTransaction storeId="synthetic" order={order} allocationSummary={beautyAllocationSummary(order)} cardAccess canRefund canConfirm={false} canEdit={false} canVoid={false} staffOptions={[]}/></main></OperationScope>);
