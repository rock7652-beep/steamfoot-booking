import {z} from 'zod';
import {courseChargeSettings} from './course-charge-settings';
export type CostPlan={id:string;name:string;price:number;storeCost:number;points:number;unit:string;isActive:boolean;musicTerms?:number|null;musicTermSizes?:number[];musicBonusLessons?:number;chargeSettings?:unknown};
/** A confirmation covers these exact prices/costs, not another catalog revision. */
export function courseFeeCostVersion(plan:CostPlan){
 const settings=courseChargeSettings.safeParse(plan.chargeSettings);
 return JSON.stringify({id:plan.id,name:plan.name,price:plan.price,storeCost:plan.storeCost,points:plan.points,unit:plan.unit,isActive:plan.isActive,periods:plan.musicTerms??null,termSizes:plan.musicTermSizes??[],bonus:plan.musicBonusLessons??0,trial:settings.success?{kind:settings.data.kind,duration:settings.data.durationMinutes,trialDuration:settings.data.trialDuration,price:settings.data.trialPrice,cost:settings.data.trialStoreCost??null}:null});
}
export const coursePurchaseCostSnapshot=z.object({version:z.literal(1),planId:z.string().min(1),storeCost:z.number().int().nonnegative(),basePrice:z.number().int().nonnegative(),quotedPrice:z.number().int().nonnegative(),basePoints:z.number().int().positive(),purchasedPoints:z.number().int().positive(),feeVersion:z.string().max(10000).optional()});
export function purchaseCostReview(input:{received:number;refunds:number;due?:number;zeroConfirmed?:boolean;snapshot:unknown}){
 const parsed=coursePurchaseCostSnapshot.safeParse(input.snapshot);
 const cost=parsed.success&&parsed.data.basePrice===parsed.data.quotedPrice&&parsed.data.basePoints===parsed.data.purchasedPoints?parsed.data.storeCost:null;
 const issue=!parsed.success?'缺少交易當下成本':cost===null?'購買期數或價格基準不同，成本待核對':input.refunds>0?'已有退款，成本分攤待核對':input.due!==undefined&&input.received<input.due?'尚未收足':cost===0&&!input.zeroConfirmed?'零成本待店家核對':null;
 return {cost,difference:issue===null?input.received-cost!:null,issue};
}
export function courseCostReviewerRole(role:string){return role==='OWNER'||role==='ADMIN';}
