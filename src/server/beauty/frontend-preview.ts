import 'server-only';
import {z} from 'zod';
import {authorizeFrontendPreview} from '@/server/services/frontend-preview';
import {resolveCentralMemberCustomerForStore} from '@/server/services/central-member-resolver';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {beautyPortalForActor} from './queries';
import {requireBeauty,type BeautyActor} from './access';
import {AppError} from '@/lib/errors';
import {requireStoreFeature} from '@/lib/feature-gate';
import {checkPermission} from '@/lib/permissions';
import {FEATURES} from '@/lib/feature-flags';
import {beautyCardHistoryForActor,beautyOwnIncomeForActor,beautyWorkRecordsForActor} from './portal-details';
import {readCustomerHealthForStore} from '@/server/services/customer-health-read';
import {beautyHealthEnabled} from './health';
import {beautySlotsForActor} from './availability';
import type {FrontendPreviewSelection} from '@/server/services/frontend-preview';
export const beautyPreviewSelection=z.object({storeId:z.string().min(1).max(180),personId:z.string().min(1).max(180),role:z.enum(['member','work'])});
async function actor(selection:FrontendPreviewSelection){
 const input=beautyPreviewSelection.parse(selection),access=await authorizeFrontendPreview(input);
 if(access.moduleId!=='beauty')throw new AppError('FORBIDDEN','此入口僅供美業前台預覽');
 await requireBeauty(access.storeId);await requireStoreFeature(access.storeId,FEATURES.MEMBER_PORTAL);
 let a:BeautyActor={storeId:access.storeId,userId:access.personUserId};
 if(input.role==='work'){
  const t=await beautyPrisma.beautyTechnician.findFirst({where:{storeId:access.storeId,id:access.personId,active:true},select:{id:true,userId:true,grants:true}});
  if(!t)throw new AppError('FORBIDDEN','技師身分已停用');
  const linked=t.userId?await resolveCentralMemberCustomerForStore(t.userId,access.storeId):null;
  a={...a,userId:t.userId,technicianId:t.id,grants:t.grants,...(linked?{customerId:linked.customerId}:{})};
 }else a={...a,customerId:access.personId};
 return {a,access};
}
export async function loadBeautyPreview(selection:FrontendPreviewSelection,month?:string){
 const {a,access}=await actor(selection),data=await beautyPortalForActor(a,selection.role==='work',month);
 let memberId=selection.role==='member'?access.personId:null,technicianId=selection.role==='work'?access.personId:null;
 if(access.personUserId){
  if(selection.role==='member'&&(access.user.role==='OWNER'||access.user.role==='ADMIN')&&await checkPermission(access.user.role,access.user.staffId,'staff.view')){
   const t=await beautyPrisma.beautyTechnician.findFirst({where:{storeId:access.storeId,userId:access.personUserId,active:true},select:{id:true}});
   if(t){await authorizeFrontendPreview({storeId:access.storeId,personId:t.id,role:'work'});technicianId=t.id;}
  }else if(selection.role==='work'&&a.customerId&&await checkPermission(access.user.role,access.user.staffId,'wallet.read')){await authorizeFrontendPreview({storeId:access.storeId,personId:a.customerId,role:'member'});memberId=a.customerId;}
 }
 return {data:{...data,canWork:!!technicianId},memberId,technicianId};
}
/** GET-only reads. The selected identity is authorized anew for every request. */
export async function readBeautyPreview(selection:FrontendPreviewSelection,kind:string,input:unknown){
 const {a}=await actor(selection);
 if(kind==='history'){
  if(selection.role!=='member')throw new AppError('FORBIDDEN','請切換會員身分');
  return beautyCardHistoryForActor(a,z.string().min(1).max(180).parse(input));
 }
 if(kind==='income'||kind==='records'){
  if(selection.role!=='work'||!a.technicianId)throw new AppError('FORBIDDEN','請切換技師身分');
  return kind==='income'?beautyOwnIncomeForActor(a,z.string().parse(input)):beautyWorkRecordsForActor(a,input);
 }
 if(kind==='health'){
  if(selection.role!=='member'||!a.customerId||!await beautyHealthEnabled(a.storeId))throw new AppError('FORBIDDEN','健康功能尚未開放');
  await requireStoreFeature(a.storeId,FEATURES.AI_HEALTH_SUMMARY);
  return (await readCustomerHealthForStore(a.storeId,a.customerId)).data;
 }
 if(kind==='slots'){
  if(selection.role!=='member'||!a.customerId)throw new AppError('FORBIDDEN','請切換會員身分');
  const customer=await prisma.customer.findFirst({where:{storeId:a.storeId,id:a.customerId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError('FORBIDDEN','會員資料已變更');
  return beautySlotsForActor('member',input,a);
 }
 throw new AppError('VALIDATION','不支援此預覽資料');
}
