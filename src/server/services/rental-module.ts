import 'server-only';
import {coursePrisma} from '@/lib/course-db';
import {courseManager,courseManagerRead,courseTransaction} from './course-access';
import {AppError} from '@/lib/errors';
import type {PermissionCode} from '@/lib/permissions';
import type {Prisma} from '../../../generated/course-client';
export type RentalModule='course'|'beauty';
/** Rental is a shared CourseRoom/CourseRental capability, never a Beauty card transaction. */
export async function rentalManager(module:RentalModule,permission:PermissionCode,write=true){
 if(module!=='course'&&module!=='beauty')throw new AppError('VALIDATION','租借模組不正確');
 if(module!=='beauty')return write?courseManager(permission):courseManagerRead(permission);
 const [{beautyManager},{requireSession}]=await Promise.all([import("@/server/beauty/access"),import("@/lib/session")]);
 const actor=await beautyManager(permission,write),user=await requireSession();
 if(actor.userId!==user.id)throw new AppError('FORBIDDEN','登入身分已變更');
 return {storeId:actor.storeId,user};
}
export async function rentalTransaction<T>(module:RentalModule,storeId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>){
 if(module!=='course'&&module!=='beauty')throw new AppError('VALIDATION','租借模組不正確');
 if(module!=='beauty')return courseTransaction(storeId,work);
 return coursePrisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
  if(!rows.length)throw new AppError('FORBIDDEN','美業店家已變更');
  return work(tx);
 },{timeout:20000});
}
