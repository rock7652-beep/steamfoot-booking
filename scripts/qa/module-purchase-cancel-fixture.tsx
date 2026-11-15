// Real shared purchase UI with synthetic actions; no backend access.
import { createRoot } from 'react-dom/client';
import { CourseTransactionActions } from '../../src/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions';
import { BeautyNativeTransaction } from '../../src/components/beauty/native-transaction-source';
const moduleName=new URLSearchParams(location.search).get('module')??'fitness';
const order={id:'synthetic-purchase',customerName:'合成顧客',name:'合成十堂方案',status:'CONFIRMED',price:5990,points:10,remaining:10,reserved:0,attended:0,usedQuota:0,unit:'SESSION',expiresAt:null,transferLastFive:'',refunds:[],note:'',revenueStaffId:null,voidReason:null,revision:0,...(moduleName==='music'?{tuitionDue:12000,tuitionReceipts:[{id:'synthetic-installment',amount:5990,date:'2026/11/14',method:'CASH',lastFour:null}]}:{})};
const grants={order,allocationSummary:'',canRefund:true,canConfirm:false,canEdit:true,canVoid:true,staffOptions:[]};
createRoot(document.getElementById('root')!).render(<main className="p-4"><h1>{moduleName} 購買取消・合成操作預覽</h1>{moduleName==='beauty'?<BeautyNativeTransaction storeId="synthetic-store" cardAccess {...grants}/>:<CourseTransactionActions {...grants}/>}</main>);
