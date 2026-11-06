import {describe,it,expect} from 'vitest';
import {availableGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
describe('backend agreement and monthly guide discovery',()=>{
 it('keeps signing evidence behind both read permissions and separates settings management',()=>{
  const a:GuideAccess={module:'course',permissions:['business_hours.manage'],features:{}};
  expect(findOperationGuides('共同約定',a).some(g=>g.id==='AGR01')).toBe(true);
  expect(availableGuides(a).some(g=>g.id==='AGR02')).toBe(false);
  expect(findOperationGuides('簽署紀錄 PDF',{...a,permissions:['customer.read','business_hours.view']}).some(g=>g.id==='AGR02')).toBe(true);
  expect(availableGuides({...a,module:'steamfoot'}).some(g=>g.id==='AGR01'||g.id==='AGR02')).toBe(false);
 });
 it('requires monthly entitlement and staff management to expose adjustment instructions',()=>{
  const a:GuideAccess={module:'beauty',permissions:['staff.manage'],features:{service_fee_calculator:true}};
  expect(findOperationGuides('獎勵 調整',a).some(g=>g.id==='MONTH01')).toBe(true);
  expect(availableGuides({...a,permissions:['report.read']}).some(g=>g.id==='MONTH01')).toBe(false);
  expect(availableGuides({...a,features:{}}).some(g=>g.id==='MONTH01')).toBe(false);
 });
});
