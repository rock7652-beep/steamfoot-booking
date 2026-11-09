import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../../generated/course-client';
import { emptyCourseAgreement, buildCourseAgreement } from '@/lib/course-agreement';
import { signatureSvg } from '@/lib/course-agreement-signing';
export async function courseAgreementEvidenceFixture(minor = true) {
  const storeId = 'fixture-store', id = 'fixture-signature', versionId = 'fixture-version';
  const draft = {...emptyCourseAgreement('合成音樂教室','030000000','合成路1號'),entity:'合成短期補習班',responsible:'合成負責人',makeup:'雙方協調補課',privacyNotice:'此為合成資料。'};
  const document = buildCourseAgreement(draft);
  const png = await sharp(Buffer.from(signatureSvg([[{x:.1,y:.2},{x:.4,y:.6},{x:.7,y:.3}]]))).png().toBuffer();
  const deliveredAt = new Date('2026-11-02T16:00:00Z'), signedAt = new Date('2026-11-03T15:59:59.999Z');
  const signerSnapshot = minor ? {name:'合成學員',phone:'0911000001',minor:true,guardian:{name:'合成家長',phone:'0911000002',relation:'母親'}} : {name:'成年合成學員',phone:'0911000001',minor:false};
  return {
    id,storeId,versionId,reviewId:'fixture-review',customerId:null,signerSnapshot:signerSnapshot as Prisma.JsonValue,
    signatureObjectKey:`${storeId}/agreements/${id}.png`,signatureHash:createHash('sha256').update(png).digest('hex'),receiptTokenHash:'a'.repeat(64),requestKey:'fixture-request',requestHash:'a'.repeat(64),reviewAcknowledgedAt:signedAt,electronicConsentAt:signedAt,signedAt,
    version:{id:versionId,storeId,version:1,settingsSnapshot:draft as Prisma.JsonValue,document:document as unknown as Prisma.JsonValue,documentHash:createHash('sha256').update(JSON.stringify(document)).digest('hex'),signingTokenHash:'a'.repeat(64),createdById:'fixture-manager',createdAt:deliveredAt},
    review:{id:'fixture-review',storeId,versionId,tokenHash:'a'.repeat(64),deliveredAt,expiresAt:new Date('2026-11-10T16:00:00Z'),consumedAt:signedAt},
    asset:{objectKey:`${storeId}/agreements/${id}.png`,signatureId:id,storeId,content:new Uint8Array(png),createdAt:signedAt},
  };
}
