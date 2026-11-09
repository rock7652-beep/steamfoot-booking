import 'server-only';
import type {Prisma} from '../../../generated/course-client';
import {AppError} from '@/lib/app-error';
import {lockCourseStore} from './course-store-lock';
export async function lockAgreementStore(tx: Pick<Prisma.TransactionClient,'$queryRaw'>, storeId: string, profile?: string) {
  if (profile !== 'BEAUTY') return lockCourseStore(tx,storeId);
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
  if(rows.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
}
