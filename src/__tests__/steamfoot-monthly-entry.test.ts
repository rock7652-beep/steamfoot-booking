import {describe,expect,it} from 'vitest';
import {operationsArea,operationsHref,legacyOperationsHref,scopedOperationsHref,legacyOperationsDestination} from '@/lib/operations-navigation';
describe('shared monthly navigation',()=>{
 it('carries the selected reporting month without carrying unrelated list filters',()=>{
  const href=new URL(operationsHref('monthly',{dateFrom:'2026-09-01',dateTo:'2026-09-30',status:'PENDING',page:'4',dataScope:'legacy'}),'https://example.test');
  expect(href.searchParams.get('month')).toBe('2026-09');expect(href.searchParams.get('dataScope')).toBe('legacy');
  expect(href.searchParams.has('status')).toBe(false);expect(href.searchParams.has('page')).toBe(false);
 });
 it('retains explicit month and old person/history filters when following a bookmark',()=>{
  const href=new URL(legacyOperationsHref('monthly',{month:'2026-08',teacherId:'teacher',salaryData:'legacy',view:'legacy'}),'https://example.test');
  expect(href.searchParams.get('area')).toBe('monthly');expect(href.searchParams.get('month')).toBe('2026-08');expect(href.searchParams.get('teacherId')).toBe('teacher');expect(href.searchParams.get('view')).toBe('legacy');
 });
 it('maps the former beauty fee area to monthly and rejects unknown areas',()=>{
  expect(operationsArea('fees')).toBe('monthly');expect(operationsArea('untrusted')).toBe('ledger');
 });
});

it('keeps HQ, store and legacy namespaces during operations redirects',()=>{
 expect(scopedOperationsHref('/dashboard/revenue?area=monthly','/hq/dashboard/service-fee-calculator')).toBe('/hq/dashboard/revenue?area=monthly');
 expect(scopedOperationsHref('/dashboard/revenue?area=income','/s/child/admin/dashboard/beauty')).toBe('/s/child/admin/dashboard/revenue?area=income');
 expect(scopedOperationsHref('/dashboard/revenue','/dashboard/cashbook')).toBe('/dashboard/revenue');
});

it('moves legacy tools before rendering while preserving their parameters',()=>{
 const value=new URL(legacyOperationsDestination('/s/child/admin/dashboard/cashbook',new URLSearchParams({month:'2026-09',q:'材料',page:'2'}))!,'https://example.test');
 expect(value.pathname).toBe('/s/child/admin/dashboard/revenue');expect(value.searchParams.get('area')).toBe('cashbook');expect(value.searchParams.get('q')).toBe('材料');expect(value.searchParams.get('page')).toBe('2');
 expect(legacyOperationsDestination('/hq/dashboard/service-fee-calculator',new URLSearchParams({teacherId:'teacher'}))).toContain('area=monthly');
 expect(legacyOperationsDestination('/dashboard/data-export',new URLSearchParams())).toContain('reportView=data');
 expect(legacyOperationsDestination('/dashboard/store-revenue',new URLSearchParams())).toContain('reportView=overview');
 expect(legacyOperationsDestination('/dashboard/reconciliation',new URLSearchParams({runId:'run'}))).toContain('checks=1');
});
it('does not intercept current tabs, editing pages or unrelated routes',()=>{
 for(const path of ['/s/child/admin/dashboard/revenue','/hq/dashboard/cashbook/new','/dashboard/cashbook/entry/edit','/api/data-export'])expect(legacyOperationsDestination(path,new URLSearchParams())).toBeNull();
});
