import {describe,it,expect} from 'vitest';
import {availableGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
describe('backend add-on and attendance guide access',()=>{
 it('finds independent catalog management without requiring bank editing',()=>{
  for(const moduleKind of ['steamfoot','course','beauty'] as const){
   const a:GuideAccess={module:moduleKind,permissions:['add_ons.manage'],features:{}};
   expect(findOperationGuides('加購商品 未開通',a).some(g=>g.id==='ADD01')).toBe(true);
   expect(availableGuides({...a,permissions:['plans.edit']}).some(g=>g.id==='ADD01')).toBe(false);
  }
 });
 it('requires financial visibility for goods history and limits technician guidance to beauty',()=>{
  const a:GuideAccess={module:'beauty',permissions:['booking.read'],features:{}};
  expect(availableGuides(a).some(g=>g.id==='ADD02')).toBe(false);
  expect(findOperationGuides('共同商品 取消不退款',{...a,permissions:['booking.read','transaction.read']}).some(g=>g.id==='ADD02')).toBe(true);
  expect(findOperationGuides('技師 缺席',a).some(g=>g.id==='BEAUTY10')).toBe(true);
  expect(availableGuides({...a,module:'course'}).some(g=>g.id==='BEAUTY10')).toBe(false);
 });
});
