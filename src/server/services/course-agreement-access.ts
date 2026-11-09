import 'server-only';
import { AppError } from '@/lib/app-error';
import { requirePermission } from '@/lib/permissions';
import { courseManager, courseManagerRead } from './course-access';
import { readCourseAgreementProfile } from './course-agreement-profile';

export type CourseAgreementOperation = 'read' | 'manage' | 'export';

/**
 * Module eligibility composes existing permissions.
 * Never use a client storeId as authorization or silently accept a stale tab.
 */
export async function requireCourseAgreementAccess(
  operation: CourseAgreementOperation,
  expectedStoreId?: string,
  module: 'COURSE' | 'BEAUTY' = 'COURSE',
) {
  if (module === 'BEAUTY') {
    if (process.env.BEAUTY_AGREEMENTS_ENABLED !== '1') throw new AppError('FORBIDDEN', '美業服務約定尚未開放');
    const { beautyManager } = await import('@/server/beauty/access');
    const actor = await beautyManager(operation === 'manage' ? 'business_hours.manage' : 'customer.read', operation === 'manage');
    if (expectedStoreId !== undefined && expectedStoreId !== actor.storeId) throw new AppError('CONFLICT', '門市已切換，請重新開啟服務約定');
    if (operation !== 'manage') await requirePermission('business_hours.view');
    if (operation === 'export') await requirePermission('customer.export');
    if (!actor.userId) throw new AppError('UNAUTHORIZED','請重新登入');
    return { storeId: actor.storeId, user: { id: actor.userId }, agreementProfile: 'BEAUTY' as const };
  }
  const actor = operation === 'manage'
    ? await courseManager('business_hours.manage')
    : await courseManagerRead('customer.read');

  if (expectedStoreId !== undefined && expectedStoreId !== actor.storeId) {
    throw new AppError('CONFLICT', '門市已切換，請重新開啟課程約定');
  }
  const agreementProfile = await readCourseAgreementProfile(actor.storeId);
  if (!agreementProfile) {
    throw new AppError('FORBIDDEN', '此店家尚未開放課程約定');
  }
  // A generic customer-read grant alone must not expose agreement evidence.
  if (operation !== 'manage') await requirePermission('business_hours.view');
  if (operation === 'export') await requirePermission('customer.export');
  return { ...actor, agreementProfile };
}
