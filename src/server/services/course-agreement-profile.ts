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
