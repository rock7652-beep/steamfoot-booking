import {describe,it,expect} from 'vitest';
import {availableGuides,findOperationGuides,operationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';

describe('backend lifecycle and calendar guide discovery',()=>{
 it('finds shared message guidance with current and previous names without requiring LINE',()=>{
  for(const moduleKind of ['steamfoot','course','beauty'] as const){
   const access:GuideAccess={module:moduleKind,permissions:['booking.read'],features:{}};
   for(const query of ['數位店長 歷史訊息','數位管家 小鈴噹','全部標為已讀 待收款']){
    expect(findOperationGuides(query,access).some(g=>g.id==='DM01'),`${moduleKind}: ${query}`).toBe(true);
   }
   expect(availableGuides({...access,permissions:[]}).some(g=>g.id==='DM01')).toBe(false);
  }
 });
 it('keeps closed-day slot instructions within steamfoot and its management permission',()=>{
  const access:GuideAccess={module:'steamfoot',permissions:['business_hours.manage'],features:{}};
  expect(findOperationGuides('公休 加開',access).some(g=>g.id==='B04')).toBe(true);
  for(const moduleKind of ['course','beauty','spa'] as const)expect(availableGuides({...access,module:moduleKind}).some(g=>g.id==='B04')).toBe(false);
  expect(availableGuides({...access,permissions:['booking.read']}).some(g=>g.id==='B04')).toBe(false);
 });
 it('finds complete-roster and teacher-note recovery within their backend scopes',()=>{
  const access:GuideAccess={module:'course',permissions:['booking.read','customer.read'],features:{}};
  expect(findOperationGuides('名單完整 切月份',access).some(g=>g.id==='C165')).toBe(true);
  expect(findOperationGuides('教師備註 結果待確認',access).some(g=>g.id==='C130')).toBe(true);
  expect(findOperationGuides('名單完整 切月份',{module:'beauty',permissions:['booking.create'],features:{}}).some(g=>g.id==='BEAUTY02')).toBe(true);
  expect(availableGuides({...access,module:'steamfoot'}).some(g=>g.id==='C130'||g.id==='C165')).toBe(false);
  expect(operationGuides.some(g=>g.id.startsWith('CP'))).toBe(false);
 });
});
