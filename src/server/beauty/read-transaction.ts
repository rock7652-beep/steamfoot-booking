import 'server-only';
import {beautyPrisma} from '@/lib/beauty-db';
import type {Prisma} from '../../../generated/beauty-client';
/** Read-only consistent snapshots never queue behind the Store write lock.
 * Authorization belongs to the caller; every writer keeps beautyTransaction. */
export function beautyReadTransaction<T>(read:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 return beautyPrisma.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return read(tx);},{isolationLevel:'RepeatableRead',timeout:20000});
}
