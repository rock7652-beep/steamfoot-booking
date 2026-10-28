import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {operationGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
const state=JSON.parse(readFileSync('docs/operation-guide-audit-state.json','utf8'));
describe('10/28 backend guide scope',()=>{
 it('keeps the exact new baseline without clearing pending acceptance',()=>{
  expect(state.lastInventoriedMainCommit).toBe('979c95681a66734dfa4913ad429a1148821b6025');
  expect(state.articleCount).toBe(209);expect(state.newGuideIds).toEqual(['FIN01']);
  expect(state.backendInteractionPendingCount).toBe(105);expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
 });
 it('allows report users to discover operations without transaction permissions',()=>{
  const access:GuideAccess={module:'course',permissions:['report.read'],features:{}};
  expect(findOperationGuides('營運 月結管理',access).some(g=>g.id==='FIN01')).toBe(true);
  expect(findOperationGuides('營運 月結管理',{...access,permissions:[]}).some(g=>g.id==='FIN01')).toBe(false);
  expect(operationGuides.find(g=>g.id==='IMG01')!.details.join(' ')).toContain('中央裁切');
  expect(operationGuides.find(g=>g.id==='BEAUTY08')!.path).toContain('月結管理');
 });
});
