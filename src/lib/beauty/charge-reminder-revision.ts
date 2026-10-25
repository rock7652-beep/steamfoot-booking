import {readStoredChargeRule,storedChargeRule,type ChargeRuleOwner} from './charge-rule-storage';
import {beautyPlanReminderSchema} from './reminders';

/** Only complete, same-plan reminder audit chains may explain a non-pricing revision gap. */
export function reminderCompatibleChargeRule(value:unknown,owner:ChargeRuleOwner,events:{body:string}[]){
 const rule=readStoredChargeRule(value,owner,owner.storeId,'snapshot');
 if(rule.revision===owner.revision)return rule;
 if(!owner.chargeId.startsWith('plan:')||rule.revision>owner.revision||owner.revision-rule.revision>1000)throw Error('收費規則版本待核對');
 const planId=owner.chargeId.slice(5),covered=new Set<number>();
 for(const event of events){
  let input:unknown;try{input=JSON.parse(event.body);}catch{continue;}
  const parsed=beautyPlanReminderSchema.safeParse(input);
  if(parsed.success&&parsed.data.expectedStoreId===owner.storeId&&parsed.data.planId===planId)covered.add(parsed.data.expectedRevision);
 }
 for(let revision=rule.revision;revision<owner.revision;revision++)if(!covered.has(revision))throw Error('收費規則版本待核對');
 return readStoredChargeRule(storedChargeRule.parse({version:1,rule:{...rule,revision:owner.revision}}),owner,owner.storeId,'catalog');
}
