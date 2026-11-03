import 'server-only';
import { beautyPrisma } from '@/lib/beauty-db';
import { requireStoreFeature } from '@/lib/feature-gate';
import { FEATURES } from '@/lib/feature-flags';
import { AppError } from '@/lib/errors';
import { beautyMember } from './access';

/** Member-only balance read. The server, never the URL, chooses the member. */
export async function readBeautyMemberPlanSnapshot(slug:string) {
  const actor=await beautyMember();
  if(!actor.userId||!actor.customerId||actor.verifiedStore?.slug!==slug)
    throw new AppError('FORBIDDEN','會員或門市已變更，請重新登入');
  await requireStoreFeature(actor.storeId,FEATURES.MEMBER_PORTAL);
  const [cards,purchases]=await Promise.all([
    beautyPrisma.beautyCard.findMany({where:{storeId:actor.storeId,memberIds:{has:actor.customerId}},orderBy:{createdAt:'desc'},select:{id:true,name:true,remaining:true,expiresAt:true,closedAt:true,allowShared:true,serviceIds:true}}),
    beautyPrisma.beautyPurchase.findMany({where:{storeId:actor.storeId,customerId:actor.customerId},orderBy:{createdAt:'desc'},select:{id:true,status:true,createdAt:true}}),
  ]);
  const held=cards.length?await beautyPrisma.beautyAppointment.groupBy({by:['cardId'],where:{storeId:actor.storeId,cardId:{in:cards.map(c=>c.id)},status:'RESERVED'},_count:{id:true}}):[];
  return {
    storeId:actor.storeId,customerId:actor.customerId,scopeKey:actor.userId,
    cards:cards.map(c=>({id:c.id,name:c.name,remaining:c.remaining,held:held.find(h=>h.cardId===c.id)?._count.id??0,expiresAt:c.expiresAt.toISOString(),closed:!!c.closedAt,memberIds:[actor.customerId!],allowShared:c.allowShared,serviceIds:c.serviceIds})),
    purchases:purchases.map(p=>({...p,createdAt:p.createdAt.toISOString()})),
  };
}
export type BeautyMemberPlanSnapshot=Awaited<ReturnType<typeof readBeautyMemberPlanSnapshot>>;
