import 'server-only';
import {beautyManager} from './access';
import {getCurrentUser} from '@/lib/session';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {prisma} from '@/lib/db';
import {AppError} from '@/lib/errors';
import {loadMemberConnectionAction} from '@/server/actions/store-member-connection';
import {getCustomerPanelAdvanced} from '@/server/actions/customer-panel-advanced';
import {beautyReadStep} from './read-timing';
export async function readBeautyCustomerSupport(customerId:string){
 const [a,u]=await beautyReadStep('authorization',()=>Promise.all([beautyManager('customer.read'),getCurrentUser()]));
 if(!u)throw new AppError('FORBIDDEN','請重新登入');
 const visible=await beautyReadStep('customer_scope',()=>prisma.customer.findFirst({where:{...getManagerCustomerWhere(u.role,u.staffId,a.storeId),id:customerId,storeId:a.storeId,mergedIntoCustomerId:null},select:{id:true}}));
 if(!visible)throw new AppError('NOT_FOUND','找不到本店可查看的顧客');
 const [membership,advanced]=await Promise.all([beautyReadStep('membership',()=>loadMemberConnectionAction(customerId)),beautyReadStep('advanced',()=>getCustomerPanelAdvanced(customerId))]);
 if(!membership.success||!('canConfirm' in membership))throw new AppError('FORBIDDEN',!membership.success?membership.error:'會員資料讀取失敗');
 if(!advanced.success)throw new AppError('FORBIDDEN',advanced.error);
 return {success:true as const,data:{membership,advanced}};
}
