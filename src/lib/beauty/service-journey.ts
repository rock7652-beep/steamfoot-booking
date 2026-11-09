import {z} from 'zod';
import {key} from './contracts-key';
import {selectedAddOnIds} from './add-ons';

/** Extra main services belong to the same recipient; add-ons remain cash charges. */
export const additionalServiceInput=z.object({
 serviceId:key,serviceRevision:z.number().int().nonnegative().default(0),
 cardId:key,specifiedTechnicianId:key.nullable().default(null),
 specifiedLocationId:key.nullable().optional(),addOnIds:selectedAddOnIds,
});
export type AdditionalService=z.infer<typeof additionalServiceInput>;
export const journeyFields={additionalServices:z.array(additionalServiceInput).max(5).optional(),separateTechnicians:z.boolean().optional()};
export function journeyIssue(p:{serviceId:string;cardId?:string|null;isTrial?:boolean;customerId?:string|null;pendingIdentity?:boolean;additionalServices?:AdditionalService[]}){
 if(!p.additionalServices?.length)return '';
 if(p.isTrial||!p.cardId||p.pendingIdentity)return '合併服務須使用本人不同主服務的有效方案，不適用體驗或資料後補';
 const rows=[{serviceId:p.serviceId,cardId:p.cardId},...p.additionalServices];
 if(new Set(rows.map(s=>s.serviceId)).size!==rows.length)return '同一主服務不可重複加入，請使用加做項目';
 if(new Set(rows.map(s=>s.cardId)).size!==rows.length)return '每個主服務須使用不同的多次方案';
 return '';
}
