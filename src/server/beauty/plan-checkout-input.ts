import { z } from 'zod';
import { courseCheckoutSchema } from '@/lib/course-checkout';
import {isSportsSharedCardIsolatedConnection} from '../../../scripts/sports-shared-card-preview-scope.mjs';

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
export function beautyPurchaseIntentStoreAllowed(storeId?:string):boolean {
  if(process.env.BEAUTY_PURCHASE_QA_STORE_SCOPE!=='1')return process.env.VERCEL_GIT_COMMIT_REF!=='preview/beauty-ui-alignment-20261021';
  if(['fix/calendar-restored-month-consistency','fix/beauty-collection-calendar-remount'].includes(process.env.VERCEL_GIT_COMMIT_REF??''))return process.env.VERCEL==='1'&&process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_REPO_OWNER==='rock7652-beep'&&process.env.VERCEL_GIT_REPO_SLUG==='steamfoot-booking'&&!process.env.WORKERS_CI_BRANCH&&!process.env.CF_PAGES_BRANCH&&storeId==='beauty-hosted-20261021'&&[process.env.DATABASE_URL,process.env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection);
  return process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='preview/beauty-ui-alignment-20261021'&&storeId==='beauty-hosted-20261021';
}
export function beautyPlanPurchaseIntentsEnabled(storeId?:string):boolean {
  return process.env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED==='1'&&beautyPurchaseIntentStoreAllowed(storeId);
}
