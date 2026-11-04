import { z } from 'zod';
import type { CourseAgreementClause } from './course-agreement';
const name = z.string().trim().min(1, '請填寫姓名').max(100);
const phone = z.string().trim().max(30).transform(value => value.replace(/[\s()-]/g, '')).pipe(z.string().regex(/^0\d{8,9}$/, '請填寫有效的聯絡電話'));
const point = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict();
export const signatureStrokesSchema = z.array(z.array(point).min(2).max(2000)).min(1, '請完成手寫簽名').max(100)
  .refine(strokes => strokes.reduce((sum, stroke) => sum + stroke.length, 0) <= 2000, '簽名筆畫過多，請清除重簽')
  .refine(strokes => strokes.some(stroke => stroke.some(p => Math.hypot(p.x - stroke[0].x, p.y - stroke[0].y) > 0.02)), '請完成可辨識的簽名');
export type SignatureStrokes = z.infer<typeof signatureStrokesSchema>;
const common = { name, phone };
export const courseAgreementSignerSchema = z.discriminatedUnion('minor', [
  z.object({ ...common, minor: z.literal(false) }).strict(),
  z.object({ ...common, minor: z.literal(true), guardian: z.object({ name, phone, relation: z.string().trim().min(1, '請填寫與學員的關係').max(50) }).strict() }).strict(),
]);
export type CourseAgreementSigner = z.infer<typeof courseAgreementSignerSchema>;
export const courseAgreementSignSchema = z.object({
  requestKey: z.string().uuid(), documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signer: courseAgreementSignerSchema, strokes: signatureStrokesSchema,
  readAcknowledged: z.literal(true), electronicConsent: z.literal(true),
}).strict();
export type CourseAgreementSignInput = z.infer<typeof courseAgreementSignSchema>;
export type CourseAgreementPublicDocument = { brand: string; version: number; documentHash: string; document: CourseAgreementClause[] };
export type CourseAgreementReviewView = CourseAgreementPublicDocument & { deliveredAt: string; expiresAt: string };
export type CourseAgreementCompletion = { receiptPath: string };
export type CourseAgreementReceipt = CourseAgreementPublicDocument & {
  id: string; signer: CourseAgreementSigner; deliveredAt: string; signedAt: string; signatureDataUrl: string;
};
export function signatureSvg(strokes: SignatureStrokes) {
  // Only validated numeric coordinates are interpolated. Never accept uploaded SVG.
  const paths = signatureStrokesSchema.parse(strokes).map(stroke => `<polyline points="${stroke.map(p => `${(p.x * 1000).toFixed(2)},${(p.y * 300).toFixed(2)}`).join(' ')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300" viewBox="0 0 1000 300"><rect width="1000" height="300" fill="white"/><g fill="none" stroke="#234139" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
