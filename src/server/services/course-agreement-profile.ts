import 'server-only';
import { prisma } from '@/lib/db';
import { isMusicCourseStoreFromEntitlements } from './course-business-profile';

/** Explicit entitlements only: absence of music is never proof of fitness access. */
export async function readCourseAgreementProfile(storeId: string): Promise<'MUSIC' | 'FITNESS' | null> {
  if (await isMusicCourseStoreFromEntitlements(prisma, storeId)) return 'MUSIC';
  if (process.env.COURSE_AGREEMENTS_FITNESS_ENABLED !== '1') return null;
  const grant = await prisma.storeFeatureEntitlement.findFirst({
    where: { storeId, featureKey: 'business.fitness', status: 'ENABLED' }, select: { storeId: true },
  });
  return grant ? 'FITNESS' : null;
}

export async function readBeautyAgreementProfile(storeId: string): Promise<'BEAUTY' | null> {
  if(process.env.BEAUTY_AGREEMENTS_ENABLED!=='1'||process.env.BEAUTY_MODULE_ENABLED!=='1')return null;
  const store=await prisma.store.findUnique({where:{id:storeId},select:{industryModule:true,operatingStatus:true}});
  if(!store||store.industryModule!=='BEAUTY'||!['ACTIVE','TRIAL'].includes(store.operatingStatus))return null;
  const {isStoreFeatureEnabledForRead}=await import('@/lib/feature-gate');
  return await isStoreFeatureEnabledForRead(storeId,'basic_booking')?'BEAUTY':null;
}
