import {expect,it} from 'vitest';
import {reminderCompatibleChargeRule} from '@/lib/beauty/charge-reminder-revision';
import {readStoredChargeRule} from '@/lib/beauty/charge-rule-storage';
const owner={storeId:'store',chargeId:'plan:p',revision:2,serviceIds:['s']};
const value={version:1,rule:{...owner,revision:1,mode:'SELECTED',technicianIds:['t']}};
const event=(revision=1,planId='p',storeId='store')=>({body:JSON.stringify({planId,expectedStoreId:storeId,expectedRevision:revision,enabled:true,threshold:2,expiry:{enabled:true,days:[14,7]}})});
it('recognizes the exact reminder-only version gap without mutating persisted data or loosening technician restrictions',()=>{
 const before=structuredClone(value);expect(()=>readStoredChargeRule(value,owner,'store','catalog')).toThrow('版本');
 expect(reminderCompatibleChargeRule(value,owner,[event()])).toEqual({...value.rule,revision:2});expect(value).toEqual(before);
});
it('requires every intervening revision rather than only the latest reminder audit',()=>{
 const target={...owner,revision:4};expect(()=>reminderCompatibleChargeRule(value,target,[event(1),event(3)])).toThrow();
 expect(reminderCompatibleChargeRule(value,target,[event(3),event(1),event(2)])).toMatchObject({revision:4,mode:'SELECTED',technicianIds:['t']});
});
it.each([[event(0)],[event(2)],[event(1,'foreign')],[event(1,'p','foreign')],[{body:'invalid JSON'}],[{body:'{"planId":"p","expectedRevision":1}'}]].map(events=>({events})))('fails closed without exact same-store, same-plan audit proof: %j',({events})=>expect(()=>reminderCompatibleChargeRule(value,owner,events)).toThrow());
it('never accepts a forward version, changed services, foreign rule, or service-rule revision drift',()=>{
 for(const [rule,target] of [[{...value,rule:{...value.rule,revision:3}},owner],[value,{...owner,serviceIds:['other']}],[{...value,rule:{...value.rule,storeId:'foreign'}},owner],[{...value,rule:{...value.rule,chargeId:'service:s'}},{...owner,chargeId:'service:s'}]] as const)expect(()=>reminderCompatibleChargeRule(rule,target as typeof owner,[event()])).toThrow();
});
it('leaves matching rules and historical snapshot semantics unchanged',()=>{
 expect(reminderCompatibleChargeRule(value,{...owner,revision:1},[])).toEqual(value.rule);
 expect(readStoredChargeRule(value,owner,'store','snapshot')).toEqual(value.rule);
 expect(reminderCompatibleChargeRule(null,owner,[])).toMatchObject({revision:2,mode:'LEGACY_UNRESTRICTED'});
});
