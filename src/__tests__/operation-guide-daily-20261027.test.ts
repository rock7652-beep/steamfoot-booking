import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {operationGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
const state=JSON.parse(readFileSync('docs/operation-guide-audit-state-20261027.json','utf8'));
const permissions=[...new Set(operationGuides.flatMap(g=>[g.permission,...(g.additionalPermissions??[])]).filter(Boolean))] as GuideAccess['permissions'];
describe('10/27 backend guide coverage',()=>{
 it('retains pending articles and excludes frontend retirement from live work',()=>{
  expect(state.lastInventoriedMainCommit).toBe('7251c0f4d627f5a15e5ce7677ef1c846625cbad6');
  expect(state.newGuideIds).toEqual(['BEAUTY07','BEAUTY08','BEAUTY09']);
  expect(state.backendInteractionPendingCount).toBe(100);
  expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
 });
 it('makes workflows searchable only within module, permissions and feature scope',()=>{
  const access:GuideAccess={module:'beauty',permissions,features:{line_reminder:true}};
  for(const [q,id] of [['既有服務 收款','BEAUTY07'],['收入分類 服務日','BEAUTY08'],['技師明日班表 21:00','BEAUTY09']])expect(findOperationGuides(q,access).some(g=>g.id===id)).toBe(true);
  expect(findOperationGuides('收入分類',{...access,permissions:['report.read']}).some(g=>g.id==='BEAUTY08')).toBe(false);
  expect(findOperationGuides('技師明日班表',{...access,features:{}}).some(g=>g.id==='BEAUTY09')).toBe(false);
  expect(findOperationGuides('既有服務 收款',{...access,module:'course'}).some(g=>g.id==='BEAUTY07')).toBe(false);
 });
});
