import 'server-only';
import { createHmac } from 'node:crypto';
import { AppError } from '@/lib/app-error';

/** Stable per-version tokens can be recovered for sharing without storing plaintext.
 * A dedicated server-only key must be backed up and retained with published versions.
 */
export function courseAgreementSigningToken(storeId: string, versionId: string) {
  const secret = process.env.COURSE_AGREEMENT_LINK_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new AppError('VALIDATION', '約定書簽署金鑰尚未設定，請聯絡系統管理者');
  }
  return createHmac('sha256', secret)
    .update(JSON.stringify(['course-agreements/sign/v1', storeId, versionId]))
    .digest('base64url');
}
