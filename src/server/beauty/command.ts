import 'server-only';
import type {Prisma} from '../../../generated/beauty-client';
import type {BeautyActor} from './access';
import {AppError} from '@/lib/errors';

/** The caller holds beautyTransaction's Store lock; replay is scoped to the
 * exact actor, store and intent and persists in the same business transaction. */
export async function command<T extends Prisma.InputJsonValue>(tx:Prisma.TransactionClient,a:BeautyActor,key:string,intent:unknown,work:()=>Promise<T>):Promise<T>{
  const actorKey=a.actorKey??a.userId??'public',encoded=JSON.stringify(intent);
  const previous=await tx.beautyCommand.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:key}}});
  if(previous){
    if(previous.actorKey!==actorKey||previous.intent!==encoded)throw new AppError('CONFLICT','操作請求已使用，請重新確認');
    return previous.result as T;
  }
  const result=await work();
  await tx.beautyCommand.create({data:{storeId:a.storeId,requestKey:key,actorKey,intent:encoded,result}});
  return result;
}
