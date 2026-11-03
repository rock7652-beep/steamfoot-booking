import 'server-only';
import { AppError } from '@/lib/app-error';
import { requirePermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { courseManager, courseManagerRead } from './course-access';
import { isMusicCourseStoreFromEntitlements } from './course-business-profile';

export type CourseAgreementOperation = 'read' | 'manage' | 'export';

/**
 * First rollout is music-only; grants compose existing permissions.
 * Never use a client storeId as authorization or silently accept a stale tab.
 */
export async function requireCourseAgreementAccess(
  operation: CourseAgreementOperation,
  expectedStoreId?: string,
) {
  const actor = operation === 'manage'
    ? await courseManager('business_hours.manage')
    : await courseManagerRead('customer.read');

  if (expectedStoreId !== undefined && expectedStoreId !== actor.storeId) {
    throw new AppError('CONFLICT', '門市已切換，請重新開啟課程約定');
  }
  if (!await isMusicCourseStoreFromEntitlements(prisma, actor.storeId)) {
    throw new AppError('FORBIDDEN', '課程約定整合目前僅開放音樂課程店家');
  }
  // A generic customer-read grant alone must not expose agreement evidence.
  if (operation !== 'manage') await requirePermission('business_hours.view');
  if (operation === 'export') await requirePermission('customer.export');
  return actor;
}
