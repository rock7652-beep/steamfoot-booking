import { z } from 'zod';
import { courseCheckoutSchema } from '@/lib/course-checkout';

const id=z.string().min(1).max(180);
// A single parser is used both before registering an intent and at commit.
// The resulting property order and defaults provide stable HMAC input.
export const beautyNativePlanCheckoutSchema=courseCheckoutSchema.extend({
  customerId:id,planId:id,
  expiresDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestKey:z.string().uuid(),expectedStoreId:id,
  beautyExpectedStoreCost:z.number().int().nonnegative().nullable().optional(),
  beautyRosterSessionId:z.string().min(1).max(200).optional(),
});
export function beautyPlanPurchaseIntentsEnabled():boolean {
  return process.env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED==='1';
}
