import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {operationGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
const state=JSON.parse(readFileSync('docs/operation-guide-audit-state-20261029.json','utf8'));
describe('10/29 backend reminder guide coverage',()=>{
 it('records incremental scope without clearing acceptance',()=>{
  expect(state.lastInventoriedMainCommit).toBe('3d6c38b62ede5d159ab747f570b022dbdca13373');
  expect(state.newGuideIds).toEqual([]);expect(state.updatedGuideIds).toEqual(['F01','C123','F13','BEAUTY09']);
  expect(state.backendInteractionPendingCount).toBe(105);expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
 });
 it('exposes Beauty quota and technician guides through their own module and permissions',()=>{
  const access:GuideAccess={module:'beauty',permissions:['business_hours.manage'],features:{line_reminder:true}};
  expect(findOperationGuides('額度 Email 美業',access).some(g=>g.id==='F13')).toBe(true);
  expect(findOperationGuides('技師通知 獨立分頁',access).some(g=>g.id==='BEAUTY09')).toBe(true);
  expect(findOperationGuides('額度 Email 美業',{...access,features:{}}).some(g=>g.id==='F13')).toBe(false);
  expect(operationGuides.find(g=>g.id==='BEAUTY09')!.path).not.toContain('顧客提醒');
 });
});
