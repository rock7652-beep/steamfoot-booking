import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {operationGuides,findOperationGuides} from '../lib/operation-guide';
import type {GuideAccess} from '../lib/operation-guide-types';
const state=JSON.parse(readFileSync('docs/operation-guide-audit-state-20261026.json','utf8'));
const guide=(id:string)=>operationGuides.find(g=>g.id===id)!;
const permissions=[...new Set(operationGuides.flatMap(g=>[g.permission,...(g.additionalPermissions??[])]).filter(Boolean))] as GuideAccess['permissions'];
describe('2026-10-26 backend guide audit',()=>{
 it('records exact main and retains all unverified topics',()=>{
  expect(state.lastInventoriedMainCommit).toBe('b00d2d74617edba8d94ce59a638322f7bed02428');
  expect(state.newGuideIds).toEqual(['C178','BEAUTY05','BEAUTY06']);
  expect(state.backendInteractionPendingCount).toBe(96);
  expect(operationGuides).toHaveLength(209);
  expect(state.authenticatedAcceptance.guideIdsCleared).toEqual([]);
 });
 it('finds new backend workflows with their own module and permissions',()=>{
  expect(findOperationGuides('註銷方案 不等於退款',{module:'beauty',permissions,features:{}}).some(g=>g.id==='BEAUTY05')).toBe(true);
  expect(findOperationGuides('單次收費 體驗店家費用',{module:'course',permissions,features:{}}).some(g=>g.id==='C178')).toBe(true);
  expect(findOperationGuides('註銷方案',{module:'beauty',permissions:['customer.read'],features:{}}).some(g=>g.id==='BEAUTY05')).toBe(false);
  expect(guide('C171').important).toContain('不再逐店加入部署白名單');
  expect(guide('BEAUTY06').details.join(' ')).toContain('累計退款');
 });
});
