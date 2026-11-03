import 'server-only';
import type {Prisma} from '../../../generated/beauty-client';
import {AppError} from '@/lib/errors';

/** Same eligibility ledger for public, member and back-office bookings. */
export async function assertBeautyTrialEligibility(tx:Prisma.TransactionClient,storeId:string,person:{serviceId:string;customerId?:string|null;phone:string},excludeId?:string){
 const identity=[...(person.customerId?[{customerId:person.customerId}]:[]),...(person.phone?[{personPhone:person.phone}]:[])];
 if(!identity.length)throw new AppError('BUSINESS_RULE','體驗須先補齊顧客身分，請聯絡店家安排');
 const used=await tx.beautyAppointment.count({where:{storeId,serviceId:person.serviceId,isTrial:true,status:{not:'CANCELLED'},OR:identity,...(excludeId?{id:{not:excludeId}}:{})}});
 if(used)throw new AppError('BUSINESS_RULE','每人每項服務限體驗一次，請改選單次或方案');
}
