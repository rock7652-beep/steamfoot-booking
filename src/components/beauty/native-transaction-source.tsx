"use client";
import {CourseTransactionActions,type CourseTransactionDetail} from '@/app/(dashboard)/dashboard/revenue/_components/course-transaction-actions';
import {refundBeautyNativeTransaction,confirmBeautyNativeTransaction} from '@/server/actions/beauty-native-transactions';
export function BeautyNativeTransaction({storeId,order,canRefund,canConfirm,cardAccess}:{storeId:string;order:CourseTransactionDetail;canRefund:boolean;canConfirm:boolean;cardAccess:boolean}){
 const cardBased=order.unit==='SESSION';
 return <CourseTransactionActions quiet order={order} allocationSummary="" staffOptions={[]} canEdit={false} canVoid={false} canRefund={canRefund&&(!cardBased||cardAccess)} canConfirm={canConfirm} source={{cardBased,quotaVisible:cardAccess,unitLabel:'次',maxReason:500,refund:input=>refundBeautyNativeTransaction({...input as Record<string,unknown>,expectedStoreId:storeId}),confirm:input=>confirmBeautyNativeTransaction({...input as Record<string,unknown>,expectedStoreId:storeId})}}/>;
}
