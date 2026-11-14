import {describe,it,expect} from 'vitest';
import {availableGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
describe('backend plan management and digital manager discovery',()=>{
 it('requires adjustment and customer visibility for cross-module plan management',()=>{
  for(const kind of ['steamfoot','course','beauty'] as const){
   const a:GuideAccess={module:kind,permissions:['wallet.adjust','customer.read'],features:{}};
   expect(findOperationGuides('註銷 期限',a).some(g=>g.id==='PM01')).toBe(true);
   expect(availableGuides({...a,permissions:['wallet.adjust']}).some(g=>g.id==='PM01')).toBe(false);
  }
 });
 it('keeps backend bell guidance independent from LINE entitlement and gated by booking access',()=>{
  const a:GuideAccess={module:'beauty',permissions:['booking.read'],features:{}};
  expect(findOperationGuides('數位管家 小鈴噹',a).some(g=>g.id==='DM01')).toBe(true);
  expect(availableGuides({...a,permissions:[]}).some(g=>g.id==='DM01')).toBe(false);
  expect(availableGuides({...a,module:'spa'})).toEqual([]);
 });
});
